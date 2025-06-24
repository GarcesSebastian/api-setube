import { normalizeYouTubeUrl } from "../lib/utils.js";
import ytdl from "@distube/ytdl-core";

export const infoVideo = async (req: any, res: any) => {
  const urls: string[] = req.body.urls;
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ message: "Falta arreglo de URLs" });
  }

  const format = req.body.format || "mp4";
  const infoUrls: { url: string; title: string; description: string | null; thumbnail: { url: string, width: number, height: number } }[] = [];
  
  await Promise.all(urls.map(async url => {
    const urlNoNormalize = normalizeYouTubeUrl(url);
    const { videoDetails } = await ytdl.getBasicInfo(urlNoNormalize || url);
    const { title, description, thumbnail } = videoDetails;
    infoUrls.push({ url: urlNoNormalize || url, title, description, thumbnail: thumbnail.thumbnails[thumbnail.thumbnails.length - 1] });
  }));

  return res.json({ format, urls: infoUrls });
}

export const convertToVideo = async (req: any, res: any) => {
  res.status(200).json({ message: "En desarrollo" });
}