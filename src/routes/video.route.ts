import { Router } from "express";
import { convertToVideo, infoVideo } from "../controllers/video.controller.js";

const router = Router();

router.get("/info", infoVideo);
router.post("/convert", convertToVideo);

export { router };
