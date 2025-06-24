import ytdl from "@distube/ytdl-core";
import { AgentManager } from "../managers/agent.manager.js";

export type VideoQuality = '1080p' | '720p' | '480p' | '360p' | 'highest';

const agentManager = AgentManager.getInstance();

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