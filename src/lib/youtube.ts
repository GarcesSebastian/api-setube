import { downloadAudioStream } from "./audio.js";
import { sanitizeFilename } from "./utils.js";
import path from "path";
import fs from "fs";
import { convertAudio } from "./ffmpeg.js";
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
  
      await convertAudio(stream, "mp3", "save", { outPath });
  
      return { url, filename: path.basename(outPath) };
    } catch (err: any) {
      return { url, error: err.message || "Error desconocido" };
    }
  };