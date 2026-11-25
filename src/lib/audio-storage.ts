import { randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { BadRequestError } from "./errors";

// Audio fayllar /uploads kimi AÇIQ paylaşılmır. Yalnız alanlara, müvəqqəti imzalı link ilə axıdılır.
export const AUDIO_DIR = path.resolve(process.cwd(), "private", "audio");
export const MAX_AUDIO_BYTES = 200 * 1024 * 1024;

type AudioType = "mp3" | "m4a" | "ogg" | "wav";

// Faylın İÇİNDƏKİ ilk baytlara baxırıq. Brauzerin göndərdiyi mimetype və fayl adı saxta ola bilər.
function detectAudioType(head: Buffer): AudioType | null {
  if (head.length >= 3 && head.toString("ascii", 0, 3) === "ID3") return "mp3";
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return "mp3";
  if (head.length >= 8 && head.toString("ascii", 4, 8) === "ftyp") return "m4a";
  if (head.length >= 4 && head.toString("ascii", 0, 4) === "OggS") return "ogg";
  if (head.length >= 12 && head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WAVE") return "wav";
  return null;
}

export async function ensureAudioDir() {
  await mkdir(AUDIO_DIR, { recursive: true });
}

// multer faylı müvəqqəti adla yazıb. Burada yoxlanır, düzgündürsə təsadüfi adla saxlanır, səhvdirsə silinir.
export async function finalizeAudio(tmpPath: string): Promise<string> {
  const handle = await open(tmpPath, "r");
  let head: Buffer;
  try {
    const buf = Buffer.alloc(12);
    const { bytesRead } = await handle.read(buf, 0, 12, 0);
    head = buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }

  const type = detectAudioType(head);
  if (!type) {
    await unlink(tmpPath).catch(() => {});
    throw new BadRequestError("Yalnız MP3, M4A, OGG və ya WAV audio yükləmək olar", "INVALID_AUDIO");
  }

  const fileName = `${randomUUID()}.${type}`;
  await rename(tmpPath, path.join(AUDIO_DIR, fileName));
  return fileName;
}

// Yalnız ad qəbul edir: path traversal mümkün deyil
export function audioPath(fileName: string): string {
  return path.join(AUDIO_DIR, path.basename(fileName));
}

export async function deleteAudio(fileName: string | null): Promise<void> {
  if (!fileName) return;
  try {
    await unlink(audioPath(fileName));
  } catch {
    // fayl artıq yoxdur, problem deyil
  }
}