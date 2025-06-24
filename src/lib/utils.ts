import { ClientsManager } from "../managers/clients.manager.js";

export function sanitizeFilename(name: string) {
  const invalidChars = /[<>:"/\\|?*]/g;
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(invalidChars, "");
}

export function normalizeYouTubeUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (!["www.youtube.com", "youtube.com", "youtu.be", "music.youtube.com"].includes(url.hostname)) return null;
    if (url.hostname.includes("youtu.be")) return `https://www.youtube.com/watch?v=${url.pathname.slice(1)}`;
    const videoId = url.searchParams.get("v");
    if (!videoId) return null;
    return `https://www.youtube.com/watch?v=${videoId}`;
  } catch {
    return null;
  }
}

export function sendToAllClients(data: any) {
    const clients = ClientsManager.getInstance().getClients();
    for (const [, client] of clients) {
        client.write(`data: ${JSON.stringify(data)}\n\n`);  
    }
}