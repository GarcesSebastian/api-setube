import ytdl from "@distube/ytdl-core";
import { AgentManager } from "../managers/agent.manager.js";
import { Innertube } from 'youtubei.js';
import { normalizeYouTubeUrl } from "./utils.js";

export type VideoQuality = '1080p' | '720p' | '480p' | '360p' | 'highest';

const agentManager = AgentManager.getInstance();


// Colección de User-Agents para rotación y evasión de restricciones
const userAgents = [
  // Chrome en Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Firefox en Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  // Chrome en macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Safari en iOS
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  // Chrome en Android
  'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
];

// Colección de cookies para evadir restricciones
const cookieCollections = [
  // Configuración estándar
  {
    'CONSENT': 'YES+cb.20210328-17-p0.en+FX+030',
    'VISITOR_INFO1_LIVE': 'y4VIyEZEHSw',
    'LOGIN_INFO': 'AFmmF2swRQIhAL6-VvmWsEHJL6_U8BYdVdpD7kTDjr-qZm-KBizHDuDpAiA9OYnc1lIDhcg6hb8Jb6DkDvjvuRx9MgWl2rF4midb5A:QUQ3MjNmeWo2TFBTTnNhWDBSNE5wUV9OSTVPZ2RnM1dYMnFUTzJuZVlWdXd2aDJyRG5ZMlNsR1NsWWJlX0JqOHRyZVhZS3JRYURQcnFTMVRlZXdHM1RqaElWSGUtYWNZdV9wS0NFWHJFNXZHcUlDQWRqTnJrTXJIYVNWVW9EV2tmd2JNdm5iakFKdlBvWnNfdmtGRkZDdGtCZUw5VmlybkFn',
    'PREF': 'tz=America.Mexico_City&f4=4000000&f6=40000000'
  },
  // Configuración alternativa con más parámetros
  {
    'CONSENT': 'PENDING+915',
    'VISITOR_INFO1_LIVE': 'oDVSWfNmXb0',
    'LOGIN_INFO': 'AFmmF2swRQIhAPmhUT-7DKlG0cKT5k_SPDCxmGyCQRCmTWT4K4sqEQHcAiAD5GpXuzYKBOXx2pTAI9JjXR-2X5Y34ECOBKRyZ0M7vg:QUQ3MjNmeUNKS2F0T2JzU0RDcTRJVnJrYnRLTUVmMUo1UlJKVUVTN0tRU3dfZTRjTUhVYktxMjJYWTFHUFd0bFBNanpTdnRvVDRJX1FoWnRsWkZWeXRGNTFkM0czT2VsQUx0Y3lRbldNMXZkWXY3eU1TRmdpNkVfZDh2dWJiVlBIczVwZEVmbVo4UFhkRmdnQTl2UTB2VGhyejVXc0ZGMHBN',
    'PREF': 'f4=4000000&f5=30000&tz=America.Mexico_City'
  }
];

// Función para obtener headers con User-Agent rotativo
const getRotatingHeaders = (index = -1): Record<string, string> => {
  // Si no se especifica un índice, elegir uno aleatorio
  const agentIndex = index >= 0 ? index % userAgents.length : Math.floor(Math.random() * userAgents.length);
  
  return {
    'User-Agent': userAgents[agentIndex],
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,es-MX;q=0.8,es;q=0.7',
    'Referer': 'https://www.youtube.com/',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"'
  };
};

// Función para obtener cookies con rotación
const getRotatingCookies = (index = -1): Record<string, string> => {
  // Si no se especifica un índice, elegir uno aleatorio
  const cookieIndex = index >= 0 ? index % cookieCollections.length : Math.floor(Math.random() * cookieCollections.length);
  return cookieCollections[cookieIndex];
};

// Configuraciones para los diferentes intentos en caso de fallo
const youtubeConfigs = [
  // Configuración estándar con web
  { client_type: 'WEB', retriever: 'WEB', agent_index: 0, cookie_index: 0 },
  // Configuración fallback con ANDROID
  { client_type: 'ANDROID', retriever: 'WEB', agent_index: 1, cookie_index: 0 },
  // Configuración con TVHTML5
  { client_type: 'TVHTML5', retriever: 'WEB', agent_index: 2, cookie_index: 1 },
  // Última opción más agresiva
  { client_type: 'WEB', retriever: 'ANDROID', agent_index: 3, cookie_index: 1 },
  // Última opción con perfil móvil
  { client_type: 'ANDROID', retriever: 'ANDROID', agent_index: 4, cookie_index: 1 }
];

// Función para validar formato de ID de YouTube
const isValidYouTubeID = (id: string): boolean => {
  // IDs de YouTube deben ser de 11 caracteres con letras, números, guiones y guiones bajos
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
};

// Función para intentar reparar URLs truncadas o malformadas
const attemptToFixYouTubeUrl = (url: string): string => {
  try {
    // Comprobar si es una URL truncada de youtu.be
    if (url.includes('youtu.be/') && url.split('youtu.be/')[1].length < 11) {
      console.log('URL de youtu.be detectada como truncada');
      return url; // No podemos hacer mucho si está truncada
    }
    
    // Comprobar si es una URL truncada de youtube.com
    if ((url.includes('youtube.com/watch?v=') || url.includes('music.youtube.com/watch?v=')) && 
        url.includes('v=') && url.split('v=')[1]?.length < 11) {
      console.log('URL de youtube.com detectada como truncada');
      
      // Comprobar si hay parámetros adicionales que puedan estar interfiriendo
      const baseUrl = url.split('&')[0];
      if (baseUrl !== url) {
        console.log('Intentando usar solo la URL base sin parámetros adicionales');
        return baseUrl;
      }
    }
    
    return url;
  } catch (e) {
    console.error('Error intentando reparar URL:', e);
    return url;
  }
};

// Función avanzada para extraer ID de video de diferentes formatos de URL
const extractVideoID = (url: string): string => {
  try {
    // Normalizar la URL primero
    const normalizedUrl = normalizeYouTubeUrl(url) || url;
    let videoId = '';
    
    // Patrones de URL comunes y sus extractores
    const patterns = [
      // youtube.com/watch?v=ID
      { regex: /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/, group: 1 },
      // youtube.com/embed/ID
      { regex: /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/, group: 1 },
      // youtube.com/v/ID
      { regex: /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/, group: 1 },
      // youtube.com/shorts/ID
      { regex: /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/, group: 1 },
      // music.youtube.com/watch?v=ID
      { regex: /music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/, group: 1 }
    ];
    
    // Intentar extraer el ID usando los patrones
    for (const pattern of patterns) {
      const match = normalizedUrl.match(pattern.regex);
      if (match && match[pattern.group]) {
        videoId = match[pattern.group];
        break;
      }
    }
    
    // Si no se encontró con los patrones, intentar el método tradicional de la URL
    if (!videoId) {
      const urlObj = new URL(normalizedUrl);
      
      if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('music.youtube.com')) {
        videoId = urlObj.searchParams.get('v') || '';
      } else if (urlObj.hostname.includes('youtu.be')) {
        videoId = urlObj.pathname.substring(1);
      }
    }
    
    return videoId;
  } catch (e) {
    console.error('Error extrayendo ID de video:', e);
    return '';
  }
};

export const getVideoInfo = async (url: string): Promise<any> => {
  try {
    // Intentar reparar URLs truncadas
    const fixedUrl = attemptToFixYouTubeUrl(url);
    
    // Extraer ID usando método mejorado
    let videoId = extractVideoID(fixedUrl);
    
    console.log(`URL original: ${url}`);
    console.log(`URL fija: ${fixedUrl}`);
    console.log(`ID extraído: ${videoId}`);
    
    // Verificar si el ID tiene formato válido
    if (!videoId || !isValidYouTubeID(videoId)) {
      console.error(`ID inválido o no extraído: "${videoId}", longitud: ${videoId?.length || 0}`);
      throw new Error(`ID de video inválido o URL malformada: ${url}`);
    }

    console.log(`Intentando obtener información para video ID: ${videoId} de URL: ${fixedUrl}`);
    
    // Sistema de reintentos con diferentes configuraciones
    let lastError = null;
    let videoInfo = null;
    
    for (const config of youtubeConfigs) {
      try {
        console.log(`Intento con configuración: ${JSON.stringify(config)}`);
        
        // Obtener headers y cookies rotativas para esta configuración
        const headers = getRotatingHeaders(config.agent_index);
        const cookies = getRotatingCookies(config.cookie_index);
        
        console.log(`Usando User-Agent: ${headers['User-Agent'].substring(0, 20)}...`);
        
        // Crear una instancia de Innertube con la configuración actual y sistema anti-restricción
        const youtube = await Innertube.create({
          client_type: config.client_type as any,
          generate_session_locally: true,
          // Añadir opciones avanzadas para evadir restricciones
          fetch: {
            headers: headers
          } as any,
          // Forzar uso de IPv4 si es posible
          ipv6_preference: "ipv4"
        });
        
        // Aplicar cookies si el cliente lo soporta
        if (youtube.session.cookies) {
          try {
            // Añadir cookies para simular autenticación
            Object.entries(cookies).forEach(([key, value]) => {
              youtube.session.cookies.set(key, value);
            });
            console.log('Cookies aplicadas correctamente');
          } catch (cookieError) {
            console.warn('No se pudieron aplicar cookies:', cookieError);
          }
        }
        
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
      // Intentar con diferentes User-Agents si youtubei.js falla
      console.log(`Intentando método fallback con ytdl-core para URL: ${url}`);
      
      // Intentar con varios User-Agents
      let ytdlError;
      let videoDetails, formats;
      
      for (let i = 0; i < userAgents.length; i++) {
        try {
          const headers = getRotatingHeaders(i);
          console.log(`Intento ytdl-core ${i+1}/${userAgents.length} con User-Agent: ${headers['User-Agent'].substring(0, 20)}...`);
          
          // Añadir cookies al intento
          const cookies = getRotatingCookies(i % cookieCollections.length);
          const cookieString = Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
          
          headers['Cookie'] = cookieString;
          
          // Intentar obtener información con este agente
          const result = await ytdl.getInfo(url, { 
            requestOptions: { headers }, 
            agent: agentManager.getAgent() 
          });
          
          videoDetails = result.videoDetails;
          formats = result.formats;
          
          console.log(`Éxito con ytdl-core en el intento ${i+1}`);
          break;
        } catch (err) {
          ytdlError = err;
          console.error(`Intento ${i+1} fallido con ytdl-core: ${err.message || 'Error desconocido'}`);
          // Continuar con el siguiente User-Agent
        }
      }
      
      // Verificar si algún intento tuvo éxito
      if (!videoDetails || !formats) {
        throw new Error(`Todos los intentos con ytdl-core fallaron: ${ytdlError?.message || 'Error desconocido'}`);
      }
      
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