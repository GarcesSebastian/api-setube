import { Router } from "express";
import { convertToVideo, infoVideo, downloadVideo } from "../controllers/video.controller.js";

const router = Router();

router.get("/info", infoVideo);
router.post("/download", downloadVideo);
router.post("/convert", convertToVideo);

export { router };  
