import { normalizeYouTubeUrl, sanitizeFilename } from "../lib/utils.js";
import ytdl from "@distube/ytdl-core";
import { downloadVideoStream, VideoQuality } from "../lib/video.js";
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
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

  try {
    for (const urlMain of urls) {
      const url = normalizeYouTubeUrl(urlMain) || urlMain;
      const { info, videoStream, audioStream } = await downloadVideoStream(url, quality);
      
      if (!audioStream) {
        console.warn(`No se pudo obtener el stream de audio para ${urlMain}, se omitirá.`);
        continue;
      }

      const title = sanitizeFilename(info.videoDetails.title);
      let outPath = path.resolve(PATH_SAVE, `${title}.${format}`);

      let counter = 1;
      while (fs.existsSync(outPath)) {
        outPath = path.resolve(PATH_SAVE, `${title} (${counter}).${format}`);
        counter++;
      }
      const filename = path.basename(outPath);

      await new Promise<void>((resolve, reject) => {
        const ffmpegArgs = [
            '-loglevel', 'error',
            '-i', 'pipe:3',
            '-i', 'pipe:4',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '96k',
            '-preset', 'ultrafast',
            '-f', format,
            outPath,
        ];

        const ffmpegProcess = spawn(ffmpegPath as unknown as string, ffmpegArgs, {
            stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
        });

        if (ffmpegProcess.stdio[3]) {
          videoStream.pipe(ffmpegProcess.stdio[3] as any);
        }
        if (ffmpegProcess.stdio[4]) {
          audioStream.pipe(ffmpegProcess.stdio[4] as any);
        }

        ffmpegProcess.on('close', (code) => {
            if (code === 0) {
                converted.push({ url: urlMain, filename });
                resolve();
            } else {
                reject(new Error(`FFmpeg exited with code ${code}`));
            }
        });

        if (ffmpegProcess.stderr) {
          ffmpegProcess.stderr.on('data', (data) => {
              console.error(`FFmpeg stderr (downloadVideo): ${data}`);
          });
        }
      });
    }
    res.status(200).json({ items: converted });
  } catch (err: any) {
    console.error(`Error en el proceso de descarga: ${err.message}`);
    res.status(500).json({ error: 'Ocurrió un error durante la descarga de uno o más videos.' });
  }
}

// Configuró cookieJar para evadir restricciones de YouTube
const cookieJar = [
  // Cookies e SAPISID que ayuda a pasar las restricciones de YouTube
  { name: 'CONSENT', value: 'YES+cb.20210328-17-p0.en+FX+030', domain: '.youtube.com', path: '/' },
  { name: 'VISITOR_INFO1_LIVE', value: 'y4VIyEZEHSw', domain: '.youtube.com', path: '/' },
  // Cookie que indica preferencias de edad
  { name: 'PREF', value: 'f4=4000000&f6=40000000&tz=America.Mexico_City', domain: '.youtube.com', path: '/' }
];

// Headers con valores reales de navegador
const browserHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,es-MX;q=0.8,es;q=0.7',
  'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
  'X-Youtube-Client-Name': '1',
  'X-Youtube-Client-Version': '2.20231208.00.00'
};

export const convertToVideo = async (req: any, res: any) => {
  const urls: string[] = req.body.urls;
  if (!urls || !Array.isArray(urls) || urls.length !== 1) {
    return res.status(400).json({ message: "Por favor, proporciona una única URL en el arreglo 'urls'." });
  }

  const format: formats = req.body.format ?? "mp4";
  const quality: string = req.body.quality ?? 'highest';
  console.log(`Petición recibida - Formato: ${format}, Calidad: ${quality}, body: ${JSON.stringify(req.body)}`);

  let info: ytdl.videoInfo | null = null;
  try {
    // Normalizar URL para asegurarnos de que está en un formato estándar que YouTube acepta
    const url = normalizeYouTubeUrl(urls[0]) || urls[0];
    
    // Preparamos las opciones para las solicitudes a YouTube
    const requestOptions = {
      headers: browserHeaders
    };
    
    // ytdl-core espera un objeto especial para cookies
    const ytdlOptions = {
      requestOptions: requestOptions
    };
    
    // Si estamos en producción, agregamos un log para saber qué opciones estamos usando
    console.log('Intentando obtener información del video con headers personalizados');
    
    // Obtener la información del video
    info = await ytdl.getInfo(url, ytdlOptions);
    
    // Si llegamos aquí, la información se obtuvo correctamente
    const title = sanitizeFilename(info.videoDetails.title);
    const encodedTitle = encodeURIComponent(title);

    const targetVideoFormat = ytdl.chooseFormat(info.formats, { quality, filter: 'videoonly' });
    
    console.log(`Calidad de video para FFmpeg seleccionada: ${targetVideoFormat.qualityLabel}`);

    let audioFormat = ytdl.chooseFormat(info.formats, { filter: f => f.audioCodec === 'mp4a.40.2' });
    let useCopyForAudio = !!audioFormat;

    if (!audioFormat) {
        audioFormat = ytdl.chooseFormat(info.formats, { filter: 'audioonly', quality: 'highestaudio' });
    }

    if (!audioFormat) {
        throw new Error('No se encontró un stream de audio compatible.');
    }

    // Aplicamos las mismas opciones de headers para las descargas
    console.log('Aplicando headers personalizados a la descarga de streams');
    
    const videoStream = ytdl.downloadFromInfo(info, { 
      format: targetVideoFormat,
      requestOptions: requestOptions // Mismos headers que usamos para getInfo
    });
    
    const audioStream = ytdl.downloadFromInfo(info, { 
      format: audioFormat,
      requestOptions: requestOptions // Mismos headers que usamos para getInfo
    });

    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodedTitle}.${format}`);

    const ffmpegArgs = [
        '-loglevel', 'error',
        '-threads', '4',
        '-thread_queue_size', '4096',
        '-i', 'pipe:3',
        '-i', 'pipe:4',
        '-c:v', 'copy',
        '-preset', 'ultrafast',
        '-tune', 'fastdecode',
        '-max_muxing_queue_size', '9999'
    ];

    if (useCopyForAudio) {
        console.log(`NIVEL 2 (VÍA SEMI-RÁPIDA): Uniendo con copia directa de audio (${audioFormat.mimeType}).`);
        ffmpegArgs.push('-c:a', 'copy');
    } else {
        console.log(`NIVEL 3 (VÍA DE CALIDAD): Re-codificando audio desde ${audioFormat.mimeType} a AAC de alta calidad.`);
        ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k');
    }

    ffmpegArgs.push('-f', format);
    if (format === 'mp4') {
        ffmpegArgs.push('-movflags', 'frag_keyframe+empty_moov+faststart');
    }
    ffmpegArgs.push('pipe:1');

    const ffmpegProcess = spawn(ffmpegPath as unknown as string, ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
    });

    if(ffmpegProcess.stdio[3]) videoStream.pipe(ffmpegProcess.stdio[3] as any);
    if(ffmpegProcess.stdio[4]) audioStream.pipe(ffmpegProcess.stdio[4] as any);
    if(ffmpegProcess.stdout) ffmpegProcess.stdout.pipe(res);

    ffmpegProcess.on('error', (err) => console.error('FFmpeg process error:', err));
    if(ffmpegProcess.stderr) ffmpegProcess.stderr.on('data', (data) => console.error(`FFmpeg stderr: ${data}`));
    req.on('close', () => ffmpegProcess.kill('SIGKILL'));

  } catch (err: any) {
    console.error(`Error en el proceso de conversión: ${err.message}`);
    if (!res.headersSent) {
        let response: { error: string, availableQualities?: string[] } = {
            error: `Ocurrió un error al procesar el video.`
        };
        
        if (info) {
            try {
                const problematicFormat = info.formats.find(f => f.qualityLabel === quality);
                console.log('--- DEBUG: INFORMACIÓN DEL FORMATO PROBLEMÁTICO ---');
                console.log(problematicFormat);
                console.log('----------------------------------------------------');
            } catch (debugErr) {
                console.log('Error durante el bloque de diagnóstico:', debugErr);
            }

            const availableQualities = [...new Set(
                info.formats
                    .map(f => f.qualityLabel)
                    .filter(q => q)
            )].sort((a, b) => parseInt(b.replace('p', '')) - parseInt(a.replace('p', '')));
            
            response = {
              error: `La calidad solicitada '${quality}' no está disponible para este video.`,
              availableQualities: availableQualities
            };
        } else {
            response.error = `No se pudo obtener la información del video. La URL podría ser inválida o el video no estar disponible.`;
        }
        
        res.status(400).json(response);
    }
  }
};