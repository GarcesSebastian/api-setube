import ytdl from "@distube/ytdl-core";
import retry from "async-retry";

export async function downloadAudioStream(url: string): Promise<{ info: ytdl.videoInfo; stream: NodeJS.ReadableStream }> {
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