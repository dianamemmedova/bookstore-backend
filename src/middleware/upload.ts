import multer from "multer";
import { MAX_COVER_BYTES } from "../lib/cover-storage";

// Fayl əvvəlcə yaddaşa (RAM) gəlir, yoxlanandan sonra diskə yazılır. Ölçü limiti 2 MB, yalnız 1 fayl.
export const uploadCover = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_COVER_BYTES, files: 1 },
}).single("cover");