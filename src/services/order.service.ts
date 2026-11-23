import { Prisma, OrderStatus } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError, ConflictError, NotFoundError } from "../lib/errors";
import { presentAdminOrder, presentOrder } from "../lib/order-presenter";
import { redeemPromo } from "./promo.service";
import type { AdminOrdersQuery, CheckoutInput } from "../schemas/order.schema";

// Çatdırılma haqqı: 5 AZN, endirimdən SONRAKI məbləğ 60 AZN və ya çoxdursa pulsuz
const DELIVERY_FEE_CENTS = 500;
const FREE_DELIVERY_FROM_CENTS = 6000;

// Statusun keçid qaydası: hansı statusdan hansına keçmək olar
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};
// İstifadəçi öz sifarişini yalnız çatdırılmadan əvvəl ləğv edə bilər
const CANCELLABLE: OrderStatus[] = ["PENDING", "CONFIRMED"];

type LockedBook = {
  id: number;
  title: string;
  author: string;
  cover_url: string | null;
  price_cents: number;
  stock: number | null;
};

const orderInclude = { items: { orderBy: { id: "asc" } } } satisfies Prisma.OrderInclude;

// --- Checkout ---

export async function checkout(userId: number, input: CheckoutInput) {
  const order = await prisma.$transaction(async (tx) => {
    const cart = await tx.cartItem.findMany({ where: { userId }, orderBy: { id: "asc" } });
    if (cart.length === 0) throw new AppError("Səbət boşdur", 400, "CART_EMPTY");

    // FOR UPDATE: bu kitab sətirlərini transaksiya bitənə qədər kilidləyir. Başqa sifariş eyni kitabı
    // eyni anda alırsa növbə gözləyir, beləliklə stok mənfiyə düşmür və qiymət sifariş ortasında dəyişmir.
    // ORDER BY id: hamı eyni sırada kilidləyir, ona görə iki sifariş bir-birini ilişdirmir (deadlock).
    const bookIds = cart.map((item) => item.bookId);
    const books = await tx.$queryRaw<LockedBook[]>(Prisma.sql`
      SELECT id, title, author, cover_url, price_cents, stock
      FROM books WHERE id IN (${Prisma.join(bookIds)}) ORDER BY id FOR UPDATE
    `);
    const bookById = new Map(books.map((book) => [book.id, book]));

    const lines = cart.map((item) => {
      const book = bookById.get(item.bookId);
      // Səbətdəki kitab cart_items-in cascade-i ilə silinir, burada olmamalıdır, amma yoxlayırıq
      if (!book) throw new AppError("Səbətdəki kitab artıq mövcud deyil", 409, "BOOK_UNAVAILABLE", { bookId: item.bookId });
      if (book.stock !== null && book.stock < item.quantity) {
        throw new AppError(
          book.stock === 0 ? `"${book.title}" stokda yoxdur` : `"${book.title}" üçün stokda yalnız ${book.stock} ədəd var`,
          409,
          "INSUFFICIENT_STOCK",
          { bookId: book.id, available: book.stock },
        );
      }
      return { book, quantity: item.quantity };
    });

    // Stoku azalt (stock null = limitsiz, toxunmuruq)
    for (const { book, quantity } of lines) {
      if (book.stock !== null) {
        await tx.book.update({ where: { id: book.id }, data: { stock: { decrement: quantity } } });
      }
    }

    // Məbləğlər: hamısı integer qəpik, serverdə hesablanır
    const subtotalCents = lines.reduce((sum, line) => sum + line.book.price_cents * line.quantity, 0);

    let discountCents = 0;
    let promo: { id: number; code: string; discountPercent: number } | null = null;
    if (input.promoCode) {
      // Eyni transaksiyada: sifariş uğursuz olarsa promo istifadəsi də geri qayıdır
      promo = await redeemPromo(tx, userId, input.promoCode);
      discountCents = Math.round((subtotalCents * promo.discountPercent) / 100);
    }

    const afterDiscount = subtotalCents - discountCents;
    const deliveryFeeCents = afterDiscount >= FREE_DELIVERY_FROM_CENTS ? 0 : DELIVERY_FEE_CENTS;

    const created = await tx.order.create({
      data: {
        userId,
        payMethod: input.payMethod,
        subtotalCents,
        discountCents,
        deliveryFeeCents,
        totalCents: afterDiscount + deliveryFeeCents,
        promoCodeId: promo?.id ?? null,
        promoCode: promo?.code ?? null,
        discountPercent: promo?.discountPercent ?? null,
        fullName: input.fullName,
        phone: input.phone,
        city: input.city,
        street: input.street,
        building: input.building ?? "",
        apartment: input.apartment ?? "",
        deliveryDate: new Date(`${input.deliveryDate}T00:00:00Z`),
        items: {
          create: lines.map(({ book, quantity }) => ({
            bookId: book.id,
            title: book.title,
            author: book.author,
            coverUrl: book.cover_url,
            unitPriceCents: book.price_cents,
            quantity,
          })),
        },
      },
      include: orderInclude,
    });

    await tx.cartItem.deleteMany({ where: { userId } });
    return created;
  });

  return presentOrder(order);
}

// --- Müştəri: öz sifarişləri ---

export async function listMyOrders(userId: number) {
  const orders = await prisma.order.findMany({
    where: { userId },
    include: orderInclude,
    orderBy: { id: "desc" },
  });
  return { items: orders.map(presentOrder) };
}

export async function getMyOrder(userId: number, id: number) {
  // userId şərtdə: başqasının sifarişi "yoxdur" kimi görünür (403 yox, 404), id-nin varlığı sızmır
  const order = await prisma.order.findFirst({ where: { id, userId }, include: orderInclude });
  if (!order) throw new NotFoundError("Sifariş");
  return presentOrder(order);
}

// --- Ləğv: həm müştəri, həm admin istifadə edir ---

// Atomik: "statusu hələ ləğv oluna biləndirsə CANCELLED et". İki paralel ləğv sorğusundan yalnız biri keçir,
// ona görə stok iki dəfə qaytarılmır.
async function cancelInTx(tx: Prisma.TransactionClient, id: number, userId?: number) {
  const claimed = await tx.order.updateMany({
    where: { id, ...(userId !== undefined && { userId }), status: { in: CANCELLABLE } },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  if (claimed.count === 0) {
    const exists = await tx.order.findFirst({ where: { id, ...(userId !== undefined && { userId }) }, select: { status: true } });
    if (!exists) throw new NotFoundError("Sifariş");
    throw new ConflictError(`Bu sifariş artıq ${exists.status} statusundadır, ləğv etmək olmaz`, "ORDER_NOT_CANCELLABLE");
  }

  const order = await tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude });

  // Stoku qaytar (limitsiz kitablarda stock null qalır, toxunmuruq)
  for (const item of order.items) {
    await tx.book.updateMany({
      where: { id: item.bookId, stock: { not: null } },
      data: { stock: { increment: item.quantity } },
    });
  }

  // Promo istifadəsini azad et ki, istifadəçi kodu sonra yenidən işlədə bilsin
  if (order.promoCodeId !== null) {
    await tx.promoRedemption.deleteMany({ where: { promoCodeId: order.promoCodeId, userId: order.userId } });
  }
  return order;
}

export async function cancelMyOrder(userId: number, id: number) {
  const order = await prisma.$transaction((tx) => cancelInTx(tx, id, userId));
  return presentOrder(order);
}

// --- Admin ---

const adminInclude = {
  ...orderInclude,
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
} satisfies Prisma.OrderInclude;

export async function listAllOrders({ page, limit, status }: AdminOrdersQuery) {
  const where: Prisma.OrderWhereInput = status ? { status } : {};
  const [rows, total] = await Promise.all([
    prisma.order.findMany({ where, include: adminInclude, orderBy: { id: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.order.count({ where }),
  ]);
  return { items: rows.map(presentAdminOrder), page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getAnyOrder(id: number) {
  const order = await prisma.order.findUnique({ where: { id }, include: adminInclude });
  if (!order) throw new NotFoundError("Sifariş");
  return presentAdminOrder(order);
}

export async function updateOrderStatus(id: number, next: OrderStatus) {
  await prisma.$transaction(async (tx) => {
    if (next === "CANCELLED") {
      await cancelInTx(tx, id);
      return;
    }
    // Yalnız icazəli əvvəlki statusdan keçid: PENDING→CONFIRMED, CONFIRMED→DELIVERED
    const allowedFrom = (Object.keys(TRANSITIONS) as OrderStatus[]).filter((from) => TRANSITIONS[from].includes(next));
    const changed = await tx.order.updateMany({ where: { id, status: { in: allowedFrom } }, data: { status: next } });
    if (changed.count === 0) {
      const current = await tx.order.findUnique({ where: { id }, select: { status: true } });
      if (!current) throw new NotFoundError("Sifariş");
      throw new ConflictError(`${current.status} statusundan ${next} statusuna keçid olmaz`, "INVALID_STATUS_TRANSITION");
    }
  });
  return getAnyOrder(id);
}