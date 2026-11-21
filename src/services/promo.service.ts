import type { Prisma, PromoCode } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { isPrismaError, PrismaErrorCode } from "../lib/prisma-errors";
import { AppError, ConflictError, NotFoundError } from "../lib/errors";
import type { PaginationQuery } from "../schemas/common.schema";
import type { CreatePromoInput, UpdatePromoInput } from "../schemas/promo.schema";

const invalidPromo = () => new AppError("Promo kodu etibarlı deyil", 400, "PROMO_INVALID");
const alreadyUsed = () => new ConflictError("Bu promo kodu artıq istifadə edilib", "PROMO_ALREADY_USED");

// Aktivdir və müddəti bitməyib
function isUsable(promo: PromoCode): boolean {
  return promo.isActive && (promo.expiresAt === null || promo.expiresAt.getTime() > Date.now());
}

async function findUsable(client: Prisma.TransactionClient | typeof prisma, code: string) {
  const promo = await client.promoCode.findUnique({ where: { code } });
  // Var olmayan, söndürülmüş və müddəti bitmiş kod üçün EYNİ cavab: səbəb açıqlanmır
  if (!promo || !isUsable(promo)) throw invalidPromo();
  return promo;
}

// --- Müştəri üçün ---

// Səbətdə "tətbiq et" düyməsi. Qonaq da yoxlaya bilər (userId yoxdur), giriş edibsə "istifadə olunub" da yoxlanır.
export async function validatePromo(code: string, userId?: number) {
  const promo = await findUsable(prisma, code);

  if (userId !== undefined) {
    const used = await prisma.promoRedemption.findUnique({
      where: { promoCodeId_userId: { promoCodeId: promo.id, userId } },
    });
    if (used) throw alreadyUsed();
  }

  return { code: promo.code, description: promo.description, discountPercent: promo.discountPercent };
}

// Sifariş (Addım 9) bunu EYNİ transaksiyada çağıracaq. Baza (promoCodeId, userId) unikallığı ilə
// iki paralel sorğudan yalnız birinin keçməsini təmin edir: yoxla-sonra-yaz yarışı yoxdur.
export async function redeemPromo(tx: Prisma.TransactionClient, userId: number, code: string) {
  const promo = await findUsable(tx, code);
  try {
    await tx.promoRedemption.create({ data: { promoCodeId: promo.id, userId } });
  } catch (error) {
    if (isPrismaError(error, PrismaErrorCode.UNIQUE_VIOLATION)) throw alreadyUsed();
    throw error;
  }
  return { id: promo.id, code: promo.code, discountPercent: promo.discountPercent };
}

// --- Admin üçün ---

type PromoWithCount = PromoCode & { _count: { redemptions: number } };

function presentAdminPromo(promo: PromoWithCount) {
  return {
    id: promo.id,
    code: promo.code,
    description: promo.description,
    discountPercent: promo.discountPercent,
    isActive: promo.isActive,
    expiresAt: promo.expiresAt,
    usedCount: promo._count.redemptions,
    createdAt: promo.createdAt,
  };
}

const withCount = { _count: { select: { redemptions: true } } } as const;

export async function listPromos({ page, limit }: PaginationQuery) {
  const [rows, total] = await Promise.all([
    prisma.promoCode.findMany({ include: withCount, orderBy: { id: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.promoCode.count(),
  ]);
  return { items: rows.map(presentAdminPromo), page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function createPromo(input: CreatePromoInput) {
  try {
    const promo = await prisma.promoCode.create({ data: input, include: withCount });
    return presentAdminPromo(promo);
  } catch (error) {
    if (isPrismaError(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
      throw new ConflictError("Bu kod artıq mövcuddur", "PROMO_CODE_TAKEN");
    }
    throw error;
  }
}

export async function updatePromo(id: number, input: UpdatePromoInput) {
  // Kod yoxdursa Prisma P2025 atır, error handler onu 404-ə çevirir
  const promo = await prisma.promoCode.update({ where: { id }, data: input, include: withCount });
  return presentAdminPromo(promo);
}

export async function deletePromo(id: number): Promise<void> {
  const existing = await prisma.promoCode.findUnique({ where: { id }, include: withCount });
  if (!existing) throw new NotFoundError("Promo kodu");
  if (existing._count.redemptions > 0) {
    throw new ConflictError("Bu kod istifadə olunub, silmək olmaz. Əvəzinə deaktiv et (isActive: false)", "PROMO_IN_USE");
  }
  await prisma.promoCode.delete({ where: { id } });
}