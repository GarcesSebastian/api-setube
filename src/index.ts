import express from "express";
import cors from "cors";
import ytdl from "@distube/ytdl-core";
import ytpl from "@distube/ytpl";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import pLimit from "p-limit";
import archiver from "archiver";
import retry from "async-retry";
import { config } from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
import { PassThrough } from "stream";

interface playlistResponse extends ytpl.result {
  thumbnail: {
    url: string,
    width: number,
    height: number
  }
}

config();
ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);

const PORT = process.env.PORT || 4000;
const ORIGINS = process.env.ORIGIN?.split(",") || [];
const PATH_SAVE = "./output";
const NUM_CPUS = os.cpus().length;
const CONCURRENCY = NUM_CPUS * 2;

let clientId = 0;
const clients = new Map<number, express.Response>();

if (!fs.existsSync(PATH_SAVE)) fs.mkdirSync(PATH_SAVE, { recursive: true });

function sanitizeFilename(name: string) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizeYouTubeUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (!["www.youtube.com", "youtube.com", "youtu.be", "music.youtube.com"].includes(url.hostname)) return null;
    if (url.hostname.includes("youtu.be")) return `https://www.youtube.com/watch?v=${url.pathname.slice(1)}`;
    const videoId = url.searchParams.get("v");
    if (!videoId) return null;
    return `https://www.youtube.com/watch?v=${videoId}`;
  } catch {
    return null;
  }
}

const app = express();
app.use(cors({ origin: ORIGINS, methods: ["POST"], credentials: true }));
app.use(express.json());

function sendToAllClients(data: any) {
  for (const [, client] of clients) {
    client.write(`data: ${JSON.stringify(data)}\n\n`);  
  }
}

async function downloadAudioStream(url: string): Promise<{ info: ytdl.videoInfo; stream: NodeJS.ReadableStream }> {
  return await retry(async () => {
    const info = await ytdl.getInfo(url);
    const stream = ytdl.downloadFromInfo(info, {
      filter: "audioonly",
      highWaterMark: 1 << 25, // 32MB buffer
    });
    return { info, stream };
  }, {
    retries: 3,
    minTimeout: 2000,
  });
}

const processUrl = async (url: string): Promise<{ url: string; filename?: string; error?: string }> => {
  try {
    const { info, stream } = await downloadAudioStream(url);
    const safeTitle = sanitizeFilename(info.videoDetails.title);
    let outPath = path.join(PATH_SAVE, `${safeTitle}.mp3`);
    let counter = 1;
    while (fs.existsSync(outPath)) {
      outPath = path.join(PATH_SAVE, `${safeTitle} (${counter}).mp3`);
      counter++;
    }

    const finalFilename = path.basename(outPath);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(stream as any)
        .outputOptions(["-threads", "0", "-qscale:a", "0"])
        .format("mp3")
        .audioBitrate(192)
        .on("error", (err) => {
          console.error("Error en una conversión:", err);
          reject(err);
        })
        .on("end", () => {
          console.log(`Video Convertido ${safeTitle}`)
          resolve();
        })
        .save(outPath);
    });

    return { url, filename: finalFilename };
  } catch (err: any) {
    return { url, error: err.message || "Error desconocido" };
  }
};

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const id = clientId++;
  clients.set(id, res);

  req.on("close", () => {
    clients.delete(id);
  });
});

app.post("/download", async (req, res) => {
  const urls: string[] = req.body.urls;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ message: "Falta arreglo de URLs" });
  }
  const limit = pLimit(CONCURRENCY);
  const tasks = urls.map((url) => limit(() => processUrl(normalizeYouTubeUrl(url) || url)));
  const results = await Promise.all(tasks);
  return res.json({ cpus: NUM_CPUS, concurrency: CONCURRENCY, totalRequested: urls.length, processed: results.length, results });
});

app.post("/playlist-to-audio", async (req, res) => {
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
});

app.post("/convert-to-audio", async (req, res) => {
  const urls: string[] = req.body.urls;
  const format = req.body.format || "mp3";
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ message: "Falta arreglo de URLs" });
  }

  if (urls.length === 1) {
    const url = normalizeYouTubeUrl(urls[0]) || urls[0];
    const { info, stream } = await downloadAudioStream(url);
    const title = sanitizeFilename(info.videoDetails.title) + "." + format;
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.attachment(title);

    return ffmpeg(stream as any)
      .outputOptions(["-threads", "0", "-qscale:a", "0"])
      .format(format)
      .audioBitrate(192)
      .on("error", (err) => {
        console.error("Error en una conversión:", err);
        res.status(500).json({ message: "Error al convertir audio", error: err.message });
      })
      .on("end", () => {
        console.log(`Video Convertido ${title}`)
        res.end();
      })
      .pipe(res, { end: true });
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
  
      await new Promise<void>((resolve, reject) => {
        ffmpeg(stream as any)
          .outputOptions(["-threads", "0", "-qscale:a", "0"])
          .format(format)
          .audioBitrate(192)
          .on("error", (err) => {
            console.error("Error en una conversión:", err);
            reject(err);
          })
          .on("end", () => {
            console.log(`Video Convertido ${filename}`)
            sendToAllClients({ type: "success", filename });
            resolve();
          })
          .pipe(pass, { end: true });
      });
    } catch (err: any) {
      console.error("Error general durante conversión:", err);
    }
  }));
  
  await Promise.all(tasks);
  await archive.finalize();
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`MP3s guardados en ${PATH_SAVE}`);
});
