import type { Request } from "express";
import { prisma } from "../lib/prisma";
import { ForbiddenError, NotFoundError } from "../lib/errors";
import { AUDIO_TOKEN_TTL_SECONDS, signAudioToken } from "../lib/audio-token";

type AuthUser = NonNullable<Request["user"]>;

// Kitabı alan (ləğv olunmamış sifarişi olan) və ya admin dinləyə bilər
export async function createAudioAccess(user: AuthUser, bookId: number) {
  const book = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true, audioFile: true } });
  if (!book || !book.audioFile) throw new NotFoundError("Audio");

  if (user.role !== "ADMIN") {
    const owned = await prisma.orderItem.findFirst({
      where: { bookId, order: { userId: user.sub, status: { not: "CANCELLED" } } },
      select: { id: true },
    });
    if (!owned) throw new ForbiddenError("Bu audio kitabı dinləmək üçün əvvəlcə onu almalısınız");
  }

  return { url: `/audio/${signAudioToken(user.sub, book.id)}`, expiresInSeconds: AUDIO_TOKEN_TTL_SECONDS };
}