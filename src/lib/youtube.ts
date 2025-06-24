import { downloadAudioStream } from "./audio.js";
import { sanitizeFilename } from "./utils.js";
import path from "path";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import { PATH_SAVE } from "../config.js";

export const processUrl = async (url: string): Promise<{ url: string; filename?: string; error?: string }> => {
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
      console.log(finalFilename, outPath);
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