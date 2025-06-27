import "dotenv/config";
import express from "express";
import cors from "cors";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { config } from "dotenv";
import fs from "fs";
import { ClientsManager } from "./managers/clients.manager.js"
import { PATH_SAVE } from "./config.js";
import { router as audioRouter } from "./routes/audio.route.js";
import { router as videoRouter } from "./routes/video.route.js";
import { eventsController } from "./controllers/events.controller.js";

config();
ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);

const PORT = process.env.PORT || 4000;
const ORIGINS = process.env.ORIGIN?.split(",") || [];

if (!fs.existsSync(PATH_SAVE)) fs.mkdirSync(PATH_SAVE, { recursive: true });

const app = express();
app.use(cors({ origin: ORIGINS, credentials: true, methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.get("/events", (req, res) => {
    const clientsManager = ClientsManager.getInstance();
    eventsController(req, res, clientsManager);
});

app.use("/audio", audioRouter);
app.use("/video", videoRouter);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`MP3s guardados en ${PATH_SAVE}`);
});
