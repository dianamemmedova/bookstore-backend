import { prisma } from "../lib/prisma";
import { AppError, NotFoundError } from "../lib/errors";
import { presentBook } from "../lib/book-presenter";
import type { MergeCartInput } from "../schemas/cart.schema";

const MAX_QUANTITY = 99;

// Səbət nəticəsi: qiymətlər HƏMİŞƏ bazadakı cari qiymətdir (səbətdə qiymət saxlanmır)
export async function getCart(userId: number) {
  const rows = await prisma.cartItem.findMany({
    where: { userId },
    include: { book: true },
    orderBy: { id: "asc" },
  });

  const items = rows.map((row) => {
    const book = presentBook(row.book);
    return {
      bookId: row.bookId,
      quantity: row.quantity,
      book,
      lineTotalCents: row.book.priceCents * row.quantity,
      // Admin stoku azaldıbsa və ya kitab qurtarıbsa false: front xəbərdarlıq göstərə bilər
      available: row.book.stock === null || row.book.stock >= row.quantity,
    };
  });

  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);

  return {
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotalCents,
    subtotal: subtotalCents / 100,
  };
}

export async function setItemQuantity(userId: number, bookId: number, quantity: number) {
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) throw new NotFoundError("Kitab");

  if (book.stock !== null && quantity > book.stock) {
    throw new AppError(
      book.stock === 0 ? "Bu kitab stokda yoxdur" : `Stokda yalnız ${book.stock} ədəd var`,
      409,
      "INSUFFICIENT_STOCK",
      { available: book.stock },
    );
  }

  await prisma.cartItem.upsert({
    where: { userId_bookId: { userId, bookId } },
    create: { userId, bookId, quantity },
    update: { quantity },
  });
  return getCart(userId);
}

export async function removeItem(userId: number, bookId: number) {
  // deleteMany: sətir yoxdursa xəta atmır, nəticə eynidir (səbətdə bu kitab yoxdur)
  await prisma.cartItem.deleteMany({ where: { userId, bookId } });
  return getCart(userId);
}

export async function clearCart(userId: number): Promise<void> {
  await prisma.cartItem.deleteMany({ where: { userId } });
}

export type SkippedItem = { bookId: number; reason: "NOT_FOUND" | "OUT_OF_STOCK" };
export type AdjustedItem = { bookId: number; quantity: number };

export async function mergeCart(userId: number, input: MergeCartInput) {
  // Eyni kitab qonaq səbətində iki dəfə gələ bilər: say toplanır
  const wanted = new Map<number, number>();
  for (const { bookId, quantity } of input.items) {
    wanted.set(bookId, (wanted.get(bookId) ?? 0) + quantity);
  }
  const bookIds = [...wanted.keys()];

  const [books, existing] = await Promise.all([
    prisma.book.findMany({ where: { id: { in: bookIds } } }),
    prisma.cartItem.findMany({ where: { userId, bookId: { in: bookIds } } }),
  ]);
  const bookById = new Map(books.map((book) => [book.id, book]));
  const existingQty = new Map(existing.map((item) => [item.bookId, item.quantity]));

  const skipped: SkippedItem[] = [];
  const adjusted: AdjustedItem[] = [];
  const upserts = [];

  for (const [bookId, quantity] of wanted) {
    const book = bookById.get(bookId);
    if (!book) {
      skipped.push({ bookId, reason: "NOT_FOUND" });
      continue;
    }
    if (book.stock === 0) {
      skipped.push({ bookId, reason: "OUT_OF_STOCK" });
      continue;
    }

    const requested = (existingQty.get(bookId) ?? 0) + quantity;
    const limit = Math.min(MAX_QUANTITY, book.stock ?? MAX_QUANTITY);
    const finalQty = Math.min(requested, limit);
    if (finalQty < requested) adjusted.push({ bookId, quantity: finalQty });

    upserts.push(
      prisma.cartItem.upsert({
        where: { userId_bookId: { userId, bookId } },
        create: { userId, bookId, quantity: finalQty },
        update: { quantity: finalQty },
      }),
    );
  }

  await prisma.$transaction(upserts);
  return { cart: await getCart(userId), skipped, adjusted };
}