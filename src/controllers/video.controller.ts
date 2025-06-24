import { normalizeYouTubeUrl, sanitizeFilename } from "../lib/utils.js";
import ytdl from "@distube/ytdl-core";
import { downloadVideoStream, VideoQuality } from "../lib/video.js";
import { convertVideo } from "../lib/ffmpeg.js";
import path from "path";
import fs from "fs";
import { PATH_SAVE } from "../config.js";

export type formats = "mp4" | "webm";

export const infoVideo = async (req: any, res: any) => {
  const urls: string[] = req.body.urls;
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ message: "Falta arreglo de URLs" });
  }

  const format = req.body.format || "mp4";
  const infoUrls: { url: string; title: string; description: string | null; thumbnail: { url: string, width: number, height: number }; qualities: string[] }[] = [];
  
  await Promise.all(urls.map(async url => {
    const urlNoNormalize = normalizeYouTubeUrl(url);
    const { videoDetails, formats } = await ytdl.getInfo(urlNoNormalize || url);
    const { title, description, thumbnail } = videoDetails;

    const qualities = [...new Set(formats
      .filter(f => f.qualityLabel && f.container === 'mp4' && !f.hasAudio)
      .map(f => f.qualityLabel)
      .sort((a, b) => parseInt(b) - parseInt(a))
    )];

    infoUrls.push({ url: urlNoNormalize || url, title, description, thumbnail: thumbnail.thumbnails[thumbnail.thumbnails.length - 1], qualities });
  }));

  return res.json({ format, urls: infoUrls });
}

export const downloadVideo = async (req: any, res: any) => {
  const urls: string[] = req.body.urls;
  if(!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ message: "Falta arreglo de URLs" });
  }

  const format: formats = req.body.format ?? "mp4";
  const quality: VideoQuality = req.body.quality ?? 'highest';
  const converted: { url: string, filename: string }[] = []

  await Promise.all(urls.map(async (urlMain) => {
    const url = normalizeYouTubeUrl(urlMain) || urlMain;
    const { info, videoStream, audioStream } = await downloadVideoStream(url, quality);
    const title = sanitizeFilename(info.videoDetails.title) + "." + format;
    let outPath = path.join(PATH_SAVE, `${title}`);

    let counter = 1;
    while (fs.existsSync(outPath)) {
      outPath = path.join(PATH_SAVE, `${title} (${counter}).${format}`);
      counter++;
    }

    const filename = path.basename(outPath);
    const tempAudioPath = path.join(PATH_SAVE, `temp_audio_${Date.now()}_${filename}.m4a`);

    await new Promise<void>((resolve, reject) => {
      const fileWriteStream = fs.createWriteStream(tempAudioPath);
      audioStream?.pipe(fileWriteStream);
      fileWriteStream.on('finish', resolve);
      fileWriteStream.on('error', reject);
    });

    try {
      const conversionConfig = {
        outPath: outPath,
        videoCodec: 'copy' as const,
        audioCodec: 'copy' as const,
        audioPath: tempAudioPath,
      };

      await convertVideo(videoStream, format, "save", conversionConfig);
    } finally {
      if (fs.existsSync(tempAudioPath)) {
        fs.unlinkSync(tempAudioPath);
      }
    }

    converted.push({ url, filename })
    return;
  }))

  res.status(200).json({ items: converted });
}

export const convertToVideo = (req: any, res: any) => {
  try {
    const videoPath = path.resolve(PATH_SAVE, 'test.mp4');
    if (!fs.existsSync(videoPath)) {
      return res.status(404).send("Archivo no encontrado.");
    }

    res.status(200).json({ videoPath });
  } catch (error: any) {
    console.error(`Error al hacer streaming del video: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).send("Error interno al intentar enviar el video.");
    }
  }
};