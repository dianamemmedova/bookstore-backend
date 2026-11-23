import { randomInt } from "node:crypto";
import type { GiftCard } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { isPrismaError, PrismaErrorCode } from "../lib/prisma-errors";
import { AppError } from "../lib/errors";
import type { PaginationQuery } from "../schemas/common.schema";

// Tapılmayan, söndürülmüş və müddəti bitmiş kart üçün EYNİ cavab: səbəb açıqlanmır (nömrə təxminini çətinləşdirir)
const notFound = () => new AppError("Kart tapılmadı", 404, "GIFT_CARD_NOT_FOUND");

// 16 rəqəm: "4521" prefiksi + 12 kriptoqrafik təsadüfi rəqəm (Math.random təxmin oluna bilər, crypto yox)
function generateCode(): string {
  let tail = "";
  for (let i = 0; i < 12; i++) tail += randomInt(0, 10);
  return `4521${tail}`;
}

function present(card: GiftCard) {
  return {
    id: card.id,
    code: card.code,
    initialCents: card.initialCents,
    initial: card.initialCents / 100,
    balanceCents: card.balanceCents,
    balance: card.balanceCents / 100,
    isActive: card.isActive,
    expiresAt: card.expiresAt,
    note: card.note,
    createdAt: card.createdAt,
  };
}

// --- Müştəri: yalnız balansa baxmaq ---

export async function checkBalance(cardNumber: string) {
  const card = await prisma.giftCard.findUnique({ where: { code: cardNumber } });
  if (!card || !card.isActive || (card.expiresAt !== null && card.expiresAt.getTime() <= Date.now())) throw notFound();
  return { balanceCents: card.balanceCents, balance: card.balanceCents / 100, expiresAt: card.expiresAt };
}

// --- Admin ---

export async function createGiftCard(input: { amount: number; expiresAt?: Date | null; note?: string | null }) {
  const cents = Math.round(input.amount * 100);
  // Təsadüfi nömrə nadir halda mövcud olanla toqquşa bilər: baza unikallığı tutur, yenidən cəhd edirik
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const card = await prisma.giftCard.create({
        data: { code: generateCode(), initialCents: cents, balanceCents: cents, expiresAt: input.expiresAt ?? null, note: input.note ?? null },
      });
      return present(card);
    } catch (error) {
      if (!isPrismaError(error, PrismaErrorCode.UNIQUE_VIOLATION)) throw error;
    }
  }
  throw new AppError("Kart nömrəsi yaradıla bilmədi, yenidən cəhd edin", 500, "INTERNAL");
}

export async function listGiftCards({ page, limit }: PaginationQuery) {
  const [rows, total] = await Promise.all([
    prisma.giftCard.findMany({ orderBy: { id: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.giftCard.count(),
  ]);
  return { items: rows.map(present), page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function updateGiftCard(id: number, input: { isActive?: boolean; expiresAt?: Date | null; note?: string | null }) {
  return present(await prisma.giftCard.update({ where: { id }, data: input }));
}