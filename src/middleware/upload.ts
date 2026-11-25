import { randomUUID } from "node:crypto";
import multer from "multer";
import { MAX_COVER_BYTES } from "../lib/cover-storage";
import { AUDIO_DIR, ensureAudioDir, MAX_AUDIO_BYTES } from "../lib/audio-storage";

// Fayl əvvəlcə yaddaşa (RAM) gəlir, yoxlanandan sonra diskə yazılır. Ölçü limiti 2 MB, yalnız 1 fayl.
export const uploadCover = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_COVER_BYTES, files: 1 },
}).single("cover");

// Audio böyükdür (200 MB-a qədər), ona görə RAM-a yox, birbaşa diskə yazılır (müvəqqəti adla).
// Sonra book.service faylın içini yoxlayıb təsadüfi adla saxlayır.
export const uploadAudio = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureAudioDir().then(
        () => cb(null, AUDIO_DIR),
        (err: Error) => cb(err, AUDIO_DIR),
      );
    },
    filename: (_req, _file, cb) => cb(null, `tmp-${randomUUID()}`),
  }),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
}).single("audio");