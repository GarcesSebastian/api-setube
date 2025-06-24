import ffmpeg from "fluent-ffmpeg";
import path from "path";
import { Writable } from "stream";
import { formats as formatsAudio } from "../controllers/audio.controller.js";
import { formats as formatsVideo } from "../controllers/video.controller.js";

export type outputOptions = 'save' | 'pipe';

export type FfmpegPreset = 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow';
export type VideoCodec = 'libx264' | 'libx265' | 'copy';
export type AudioCodec = 'aac' | 'libmp3lame' | 'libopus' | 'copy';

export interface videoConfig {
    quality?: number;
    maxrate?: string;
    bufsize?: string;
    preset?: FfmpegPreset;
    size?: string;
    fps?: number;
    videoCodec?: VideoCodec;
    audioCodec?: AudioCodec;
    audioBitrate?: string;
    crf?: number;
}

export interface ConfigSave extends videoConfig {
    outPath: string;
}

export interface ConfigPipe extends videoConfig {
    outputStream: Writable;
    filename: string;
    onEndCallback?: () => void;
}

export function convertAudio(stream: any, format: formatsAudio, output: 'save', config: ConfigSave): Promise<void>;
export function convertAudio(stream: any, format: formatsAudio, output: 'pipe', config: ConfigPipe): Promise<void>;
export function convertAudio(stream: any, format: formatsAudio, output: outputOptions, config: ConfigSave | ConfigPipe): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const command = ffmpeg(stream as any)
            .outputOptions(["-threads", "0"])
            .format(format);

        if (format === "mp3") {
            command.outputOptions(["-qscale:a", "0"]).audioBitrate(192);
        }

        command
            .on('error', (err: Error, stdout: string, stderr: string) => {
                console.error('ffmpeg stdout:', stdout);
                console.error('ffmpeg stderr:', stderr);
                reject(new Error(`ffmpeg exited with code 1: ${err.message}\n\nffmpeg stderr:\n${stderr}`));
            })
            .on("end", () => {
                if ("outPath" in config) {
                    console.log(`Video Convertido ${path.basename(config.outPath)}`);
                } else {
                    console.log(`Video Convertido ${config.filename}`);
                    config.onEndCallback?.();
                }
                resolve();
            });

        if ("outPath" in config) {
            command.save(config.outPath);
        } else {
            command.pipe(config.outputStream, { end: true });
        }
    });
}

export function convertVideo(
    stream: any,
    format: formatsVideo,
    output: outputOptions,
    config: (ConfigSave | ConfigPipe) & { audioPath?: string }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let command = ffmpeg(stream as any);

      if (config.audioPath) {
        command
          .addInput(config.audioPath)
          .outputOptions([
            "-map 0:v", 
            "-map 1:a", 
          ]);
      }

      command.outputOptions(["-threads", "0"]).format(format);
  
      const isVideoCopy = config.videoCodec === 'copy';
      const isAudioCopy = config.audioCodec === 'copy';

      if (config.videoCodec) {
        command.videoCodec(config.videoCodec);
      }
      if (config.audioCodec) {
        command.audioCodec(config.audioCodec);
      }
  
      if (!isVideoCopy) {
        const crf = config.crf ?? config.quality ?? 24;
        const preset = config.preset ?? 'ultrafast';

        command.outputOptions([`-crf`, `${crf}`]);
        command.outputOptions([`-preset`, preset]);

        if (config.maxrate) command.outputOptions([`-maxrate`, config.maxrate]);
        if (config.bufsize) command.outputOptions([`-bufsize`, config.bufsize]);
        if (config.size) command.size(config.size);
        if (config.fps) command.outputFPS(config.fps);
      }
      
      if (!isAudioCopy) {
        const audioBitrate = config.audioBitrate ?? '192k';
        command.audioBitrate(audioBitrate);
      }
  
      command
        .on("error", (err) => reject(err))
        .on("end", () => {
          if ("outPath" in config) {
            console.log(`Vídeo convertido: ${path.basename(config.outPath)}`);
          } else {
            console.log(`Vídeo convertido: ${(config as ConfigPipe).filename}`);
            (config as ConfigPipe).onEndCallback?.();
          }
          resolve();
        });

      if ("outPath" in config) {
        command.save(config.outPath);
      } else {
        command.outputOptions([
          "-f", format,
          "-movflags", "frag_keyframe+empty_moov"
        ]);
        command.pipe((config as ConfigPipe).outputStream, { end: true });
      }
    });
  }