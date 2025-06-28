import ytdl from "@distube/ytdl-core";
import { AgentManager } from "../managers/agent.manager.js";
import { Innertube } from 'youtubei.js';
import { normalizeYouTubeUrl } from "./utils.js";

export type VideoQuality = '1080p' | '720p' | '480p' | '360p' | 'highest';

const agentManager = AgentManager.getInstance();


export const getVideoInfo = async (url: string): Promise<any> => {
  try {
    const normalizedUrl = normalizeYouTubeUrl(url) || url;
    
    let videoId = '';
    const urlObj = new URL(normalizedUrl);
    
    if (urlObj.hostname.includes('youtube.com')) {
      videoId = urlObj.searchParams.get('v') || '';
    } else if (urlObj.hostname.includes('youtu.be')) {
      videoId = urlObj.pathname.substring(1);
    }
    
    if (!videoId) {
      throw new Error('No se pudo extraer el ID del video desde la URL proporcionada');
    }
    
    const youtube = await Innertube.create();
    
    const video = await youtube.getBasicInfo(videoId);
    
    if (!video || !video.basic_info || !video.basic_info.title) {
      throw new Error('No se pudo obtener el título del video');
    }

    const { basic_info, streaming_data } = video;
    const { title, short_description, thumbnail } = basic_info;
    const formats = [
      ...new Set(streaming_data?.formats.map(f => f.quality_label)), 
      ...new Set(streaming_data?.adaptive_formats.map(f => f.quality_label))
    ].filter((f) => f !== undefined).sort((a, b) => parseInt(b) - parseInt(a));
    const thumbnailCurrent = thumbnail?.sort((a, b) => b.width - a.width)[0];

    const payload = {
      url,
      title,
      description: short_description?.split("alt title: ")[1] || null,
      thumbnail: thumbnailCurrent,
      qualities: formats
    };

    return payload;
  } catch (error: any) {
    console.error(`Error al obtener el título del video con youtubei.js: ${error.message}`);
    throw new Error(`No se pudo obtener el título del video: ${error.message}`);
  }
};

export const downloadVideoStream = async (url: string, quality: VideoQuality = 'highest') => {
  try {
    const info = await ytdl.getInfo(url, { agent: agentManager.getAgent() });

    const videoFormat = ytdl.chooseFormat(info.formats, {
      quality: quality === 'highest' ? 'highestvideo' : undefined,
      filter: (format) => {
        const qualityMatch = quality === 'highest' ? true : format.qualityLabel?.startsWith(quality);
        return !!(format.container === "mp4" && !format.hasAudio && qualityMatch);
      },
    });

    if (!videoFormat) {
      throw new Error(`No se encontró un formato de video MP4 para la calidad '${quality}'.`);
    }

    const audioFormat = ytdl.chooseFormat(info.formats, {
      quality: "highestaudio",
      filter: "audioonly",
    });

    if (!audioFormat) {
      throw new Error("No se encontró un formato de audio adecuado.");
    }

    const videoStream = ytdl(url, { format: videoFormat, agent: agentManager.getAgent() });
    const audioStream = ytdl(url, { format: audioFormat, agent: agentManager.getAgent() });

    return { info, videoStream, audioStream };
  } catch (error: any) {
    throw new Error(`Error al descargar el video: ${error.message}`);
  }
};