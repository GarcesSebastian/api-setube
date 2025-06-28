import ytdl from "@distube/ytdl-core";
import { AgentManager } from "../managers/agent.manager.js";
import { Innertube } from 'youtubei.js';
import { normalizeYouTubeUrl } from "./utils.js";

export type VideoQuality = '1080p' | '720p' | '480p' | '360p' | 'highest';

const agentManager = AgentManager.getInstance();


// Headers para simular ser un navegador real - importante para evadir restricciones de YouTube
const browserHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,es-MX;q=0.8,es;q=0.7',
  'Referer': 'https://www.youtube.com/'
};

// Configuraciones para los diferentes intentos en caso de fallo
const youtubeConfigs = [
  // Configuración estándar con web
  { client_type: 'WEB', retriever: 'WEB' },
  // Configuración fallback con ANDROID
  { client_type: 'ANDROID', retriever: 'WEB' },
  // Configuración con TVHTML5
  { client_type: 'TVHTML5', retriever: 'WEB' },
  // Última opción más agresiva
  { client_type: 'WEB', retriever: 'ANDROID' }
];

export const getVideoInfo = async (url: string): Promise<any> => {
  try {
    const normalizedUrl = normalizeYouTubeUrl(url) || url;
    
    // Extrae el ID del video con soporte mejorado para music.youtube.com
    let videoId = '';
    const urlObj = new URL(normalizedUrl);
    
    if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('music.youtube.com')) {
      // Soporte para youtube.com y music.youtube.com
      videoId = urlObj.searchParams.get('v') || '';
    } else if (urlObj.hostname.includes('youtu.be')) {
      videoId = urlObj.pathname.substring(1);
    }
    
    // Verificar si se encontró un ID
    if (!videoId) {
      throw new Error(`No se pudo extraer el ID del video desde la URL: ${normalizedUrl}`);
    }

    console.log(`Intentando obtener información para video ID: ${videoId} de URL: ${normalizedUrl}`);
    
    // Sistema de reintentos con diferentes configuraciones
    let lastError = null;
    let videoInfo = null;
    
    for (const config of youtubeConfigs) {
      try {
        console.log(`Intento con configuración: ${JSON.stringify(config)}`);
        
        // Crear una instancia de Innertube con la configuración actual
        const youtube = await Innertube.create({
          client_type: config.client_type as any,
          generate_session_locally: true
        });
        
        // Intentar obtener la información del video
        let video;
        
        if (config.retriever === 'WEB') {
          video = await youtube.getBasicInfo(videoId);
        } else {
          // Intento alternativo si el método Web falla
          video = await youtube.getInfo(videoId);
        }
        
        if (!video || !video.basic_info) {
          throw new Error('Respuesta incompleta de youtubei.js');
        }
        
        videoInfo = video;
        console.log(`Información obtenida exitosamente con configuración: ${JSON.stringify(config)}`);
        break;
      } catch (err: any) {
        lastError = err;
        console.error(`Intento fallido con configuración ${JSON.stringify(config)}: ${err.message || 'Error desconocido'}`);
        // Continuar con la siguiente configuración
      }
    }
    
    // Si después de todos los intentos no tenemos información, lanzar error
    if (!videoInfo || !videoInfo.basic_info || !videoInfo.basic_info.title) {
      throw new Error(`No se pudo obtener información del video después de múltiples intentos: ${lastError instanceof Error ? lastError.message : 'Error desconocido'}`);
    }

    // Formatear la respuesta
    const { basic_info, streaming_data } = videoInfo;
    const { title, short_description, thumbnail } = basic_info;
    
    // Extraer calidades de video disponibles
    const formats = [
      ...new Set(streaming_data?.formats?.map(f => f.quality_label) || []), 
      ...new Set(streaming_data?.adaptive_formats?.map(f => f.quality_label) || [])
    ].filter((f) => f !== undefined && f !== null).sort((a, b) => {
      // Ordenar por resolución, maneja formato "NNNp"
      const numA = parseInt(a.replace(/[^0-9]/g, ''));
      const numB = parseInt(b.replace(/[^0-9]/g, ''));
      return numB - numA;
    });
    
    // Obtener la mejor miniatura disponible
    const thumbnailCurrent = thumbnail?.sort((a, b) => b.width - a.width)[0];

    const payload = {
      url,
      title,
      description: short_description || null,
      thumbnail: thumbnailCurrent,
      qualities: formats.length > 0 ? formats : ['720p', '480p', '360p'] // Calidades por defecto si no se detectan
    };

    return payload;
  } catch (error: any) {
    console.error(`Error al obtener información del video con youtubei.js: ${error.message}`);
    
    // Intentar con ytdl-core como último recurso para compatibilidad hacia atrás
    try {
      console.log(`Intentando método fallback con ytdl-core para URL: ${url}`);
      const { videoDetails, formats } = await ytdl.getInfo(url, { 
        requestOptions: { headers: browserHeaders }, 
        agent: agentManager.getAgent() 
      });
      
      const { title, description, thumbnails } = videoDetails;
  
      const qualities = [...new Set(formats
        .filter(f => f.qualityLabel && f.container === 'mp4' && !f.hasAudio)
        .map(f => f.qualityLabel)
        .sort((a, b) => parseInt(b) - parseInt(a))
      )];
  
      const bestThumbnail = thumbnails[thumbnails.length - 1];
      return { 
        url, 
        title, 
        description, 
        thumbnail: bestThumbnail, 
        qualities,
        source: 'ytdl-fallback' 
      };
    } catch (ytdlError: any) {
      console.error(`También falló el fallback con ytdl-core: ${ytdlError.message || 'Error desconocido'}`);
      throw new Error(`No se pudo obtener la información del video: ${error.message || 'Error desconocido'}`);
    }
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