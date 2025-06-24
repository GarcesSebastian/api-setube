import ffmpeg from "fluent-ffmpeg";
import archiver from "archiver";
import pLimit from "p-limit";
import { NUM_CPUS, CONCURRENCY } from "../config.js";
import { PassThrough } from "stream";
import { normalizeYouTubeUrl, sanitizeFilename, sendToAllClients } from "../lib/utils.js";
import { downloadAudioStream } from "../lib/audio.js";
import { processUrl } from "../lib/youtube.js";
import ytpl from "@distube/ytpl";
import { convertAudio } from "../lib/ffmpeg.js";

export interface playlistResponse extends ytpl.result {
  thumbnail: {
    url: string,
    width: number,
    height: number
  }
}

export type formats = "mp3" | "wav" | "ogg" | "flac" | "m4a";

export const downloadAudio = async (req: any, res: any) => {
  const urls: string[] = req.body.urls;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ message: "Falta arreglo de URLs" });
  }
  const limit = pLimit(CONCURRENCY);
  const tasks = urls.map((url) => limit(() => processUrl(normalizeYouTubeUrl(url) || url)));
  const results = await Promise.all(tasks);
  return res.json({ cpus: NUM_CPUS, concurrency: CONCURRENCY, totalRequested: urls.length, processed: results.length, results });
}

export const convertToAudio = async (req: any, res: any) => {
    const urls: string[] = req.body.urls;
    const format: formats = req.body.format || "mp3";
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ message: "Falta arreglo de URLs" });
    }
  
    if (urls.length === 1) {
      const url = normalizeYouTubeUrl(urls[0]) || urls[0];
      const { info, stream } = await downloadAudioStream(url);
      const title = sanitizeFilename(info.videoDetails.title) + "." + format;
      res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
      const encodedTitle = encodeURIComponent(title);
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodedTitle}`);

      await convertAudio(stream, format, "pipe", { outputStream: res, filename: title });
      return;
    }
  
    const archive = archiver("zip");
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.attachment(`descarga-${format}-${Date.now()}.zip`);
    archive.pipe(res);
    
    const limit = pLimit(CONCURRENCY);
    const tasks = urls.map((rawUrl) => limit(async () => {
      try {
        const url = normalizeYouTubeUrl(rawUrl) || rawUrl;
        const { info, stream } = await downloadAudioStream(url);
        const filename = sanitizeFilename(info.videoDetails.title) + "." + format;
        const pass = new PassThrough();
        archive.append(pass, { name: filename });

        await convertAudio(stream, format, 'pipe', {
          outputStream: pass,
          filename: filename,
          onEndCallback: () => sendToAllClients({ type: "success", filename })
        });

      } catch (err: any) {
        console.error(`Error procesando ${rawUrl}:`, err);
        sendToAllClients({ type: "error", message: `Falló la conversión de ${rawUrl}` });
      }
    }));
    
    await Promise.all(tasks);
    await archive.finalize();
} 

export const playlistToAudio = async (req: any, res: any) => {
    const raw = req.body.url;
    if (!raw) return res.status(400).json({ message: "Falta URL" });
  
    try {
      const idOrUrl = await ytpl.getPlaylistID(raw);
      const playlist: playlistResponse = await ytpl(idOrUrl, { limit: Infinity }) as unknown as playlistResponse;
      const urls = playlist.items.map((item) => item.url);
      const { items, ...info } = playlist
      console.log(`info Nueva Playlist ${JSON.stringify(info)}`)
      return res.json({ info, total: urls.length, urls });
    } catch (err: any) {
      return res.status(500).json({ message: "Error al obtener playlist", error: err.message });
    }
}
