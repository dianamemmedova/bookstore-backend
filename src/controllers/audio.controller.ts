import type { NextFunction, Request, Response } from "express";
import * as z from "zod";
import { prisma } from "../lib/prisma";
import { NotFoundError, UnauthorizedError } from "../lib/errors";
import { audioPath } from "../lib/audio-storage";
import { verifyAudioToken } from "../lib/audio-token";
import { bookIdParamSchema } from "../schemas/book.schema";
import * as audioService from "../services/audio.service";

// GET /books/:id/audio-access (giriş lazımdır): alıbsa müvəqqəti dinləmə linki qaytarır, almayıbsa 403
export async function audioAccess(req: Request, res: Response) {
  const { id } = bookIdParamSchema.parse(req.params);
  res.json(await audioService.createAudioAccess(req.user!, Number(id)));
}

// GET /audio/:token: faylı axıdır. Range dəstəklənir, ona görə pleyerdə irəli-geri çəkmək işləyir.
export async function stream(req: Request, res: Response, next: NextFunction) {
  const { token } = z.object({ token: z.string().min(10).max(1000) }).parse(req.params);

  let bookId: number;
  try {
    bookId = verifyAudioToken(token).bookId;
  } catch {
    throw new UnauthorizedError("Audio linkinin vaxtı bitib və ya etibarsızdır");
  }

  const book = await prisma.book.findUnique({ where: { id: bookId }, select: { audioFile: true } });
  if (!book?.audioFile) throw new NotFoundError("Audio");

  res.sendFile(
    audioPath(book.audioFile),
    { acceptRanges: true, dotfiles: "allow", headers: { "Cache-Control": "private, no-store" } },
    (err) => {
      if (err && !res.headersSent) next(err);
    },
  );
}