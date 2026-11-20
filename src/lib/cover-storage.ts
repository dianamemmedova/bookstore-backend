import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { BadRequestError } from "./errors";

export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const COVERS_DIR = path.join(UPLOADS_DIR, "covers");
const COVER_URL_PREFIX = "/uploads/covers/";

export const MAX_COVER_BYTES = 2 * 1024 * 1024;

// Faylın İÇİNDƏKİ ilk baytlara baxırıq. Brauzerin göndərdiyi mimetype və fayl adı saxta ola bilər.
function detectImageType(buffer: Buffer): "jpg" | "png" | "webp" | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

// Yoxlayır, təsadüfi adla yazır və saxlanan URL-i qaytarır.
export async function saveCover(buffer: Buffer): Promise<string> {
  const type = detectImageType(buffer);
  if (!type) {
    throw new BadRequestError("Yalnız JPG, PNG və ya WEBP şəkil yükləmək olar", "INVALID_IMAGE");
  }

  await mkdir(COVERS_DIR, { recursive: true });
  // İstifadəçinin göndərdiyi ad istifadə olunmur: path traversal və ad toqquşması olmur
  const fileName = `${randomUUID()}.${type}`;
  await writeFile(path.join(COVERS_DIR, fileName), buffer);
  return `${COVER_URL_PREFIX}${fileName}`;
}

// Köhnə şəkli silir. Fayl yoxdursa və ya bizim qovluqdan deyilsə heç nə etmir.
export async function deleteCover(coverUrl: string | null): Promise<void> {
  if (!coverUrl?.startsWith(COVER_URL_PREFIX)) return;
  const fileName = path.basename(coverUrl);
  try {
    await unlink(path.join(COVERS_DIR, fileName));
  } catch {
    // fayl artıq yoxdur, problem deyil
  }
}