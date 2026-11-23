import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOW_STOCK_LIMIT = 5;

// Bakı vaxtı ilə bu gündən n gün əvvəlin tarixi: "2026-11-23"
function bakuDate(offsetDays = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baku" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Bakı günün başlanğıcı (00:00 Bakı vaxtı) UTC anı kimi
const startOfBakuDay = (date: string) => new Date(`${date}T00:00:00+04:00`);

// Gəlir = ləğv EDİLMƏMİŞ sifarişlərin yekun məbləği. deliveredCents isə yalnız çatdırılmışlar.
export async function getOverview() {
  const since30 = new Date(Date.now() - 30 * DAY_MS);

  const [byStatus, revenue, delivered, users, newUsers, books, outOfStock, lowStock, reviews, unread, subscribers] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.order.aggregate({ where: { status: { not: "CANCELLED" } }, _sum: { totalCents: true } }),
    prisma.order.aggregate({ where: { status: "DELIVERED" }, _sum: { totalCents: true } }),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since30 } } }),
    prisma.book.count(),
    prisma.book.count({ where: { stock: 0 } }),
    prisma.book.count({ where: { stock: { gt: 0, lte: LOW_STOCK_LIMIT } } }),
    prisma.review.aggregate({ _count: { _all: true }, _avg: { rating: true } }),
    prisma.contactMessage.count({ where: { isRead: false } }),
    prisma.newsletterSubscriber.count({ where: { isActive: true } }),
  ]);

  const counts = { PENDING: 0, CONFIRMED: 0, DELIVERED: 0, CANCELLED: 0 };
  for (const row of byStatus) counts[row.status] = row._count._all;
  const grossCents = revenue._sum.totalCents ?? 0;

  return {
    orders: { total: Object.values(counts).reduce((a, b) => a + b, 0), byStatus: counts },
    revenue: {
      grossCents,
      gross: grossCents / 100,
      deliveredCents: delivered._sum.totalCents ?? 0,
      delivered: (delivered._sum.totalCents ?? 0) / 100,
    },
    users: { total: users, newLast30Days: newUsers },
    books: { total: books, outOfStock, lowStock, lowStockLimit: LOW_STOCK_LIMIT },
    reviews: { total: reviews._count._all, avgRating: reviews._avg.rating === null ? 0 : Math.round(reviews._avg.rating * 10) / 10 },
    inbox: { unreadContactMessages: unread, activeSubscribers: subscribers },
  };
}

// Gündəlik satış: son N gün, hər gün üçün sifariş sayı və gəlir (ləğv olunanlar çıxılır). Satışı olmayan gün 0 ilə gəlir.
export async function getSales(days: number) {
  const firstDay = bakuDate(-(days - 1));
  const rows = await prisma.$queryRaw<{ day: string; orders: number; revenue: bigint }[]>(Prisma.sql`
    SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Baku', 'YYYY-MM-DD') AS day,
           COUNT(*)::int AS orders,
           COALESCE(SUM(total_cents), 0)::bigint AS revenue
    FROM orders
    WHERE status <> 'CANCELLED' AND created_at >= ${startOfBakuDay(firstDay)}
    GROUP BY 1
  `);
  const byDay = new Map(rows.map((row) => [row.day, row]));

  const series = Array.from({ length: days }, (_, i) => {
    const date = bakuDate(-(days - 1) + i);
    const row = byDay.get(date);
    const revenueCents = row ? Number(row.revenue) : 0;
    return { date, orders: row?.orders ?? 0, revenueCents, revenue: revenueCents / 100 };
  });

  return {
    days,
    totalOrders: series.reduce((sum, d) => sum + d.orders, 0),
    totalRevenueCents: series.reduce((sum, d) => sum + d.revenueCents, 0),
    series,
  };
}

// Ən çox satılan kitablar (ləğv olunmuş sifarişlər sayılmır)
export async function getTopBooks(limit: number, days?: number) {
  const since = days === undefined ? null : startOfBakuDay(bakuDate(-(days - 1)));
  const rows = await prisma.$queryRaw<
    { book_id: number; title: string; author: string; cover_url: string | null; quantity: number; revenue: bigint }[]
  >(Prisma.sql`
    SELECT b.id AS book_id, b.title, b.author, b.cover_url,
           SUM(oi.quantity)::int AS quantity,
           SUM(oi.quantity * oi.unit_price_cents)::bigint AS revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN books b ON b.id = oi.book_id
    WHERE o.status <> 'CANCELLED' ${since ? Prisma.sql`AND o.created_at >= ${since}` : Prisma.empty}
    GROUP BY b.id
    ORDER BY quantity DESC, revenue DESC, b.id ASC
    LIMIT ${limit}
  `);
  return {
    days: days ?? null,
    items: rows.map((row) => ({
      bookId: row.book_id,
      title: row.title,
      author: row.author,
      coverUrl: row.cover_url,
      quantitySold: row.quantity,
      revenueCents: Number(row.revenue),
      revenue: Number(row.revenue) / 100,
    })),
  };
}

// Stoku azalan və ya qurtarmış kitablar (stock null = limitsiz, bura düşmür)
export async function getLowStock(threshold: number, limit: number) {
  const books = await prisma.book.findMany({
    where: { stock: { not: null, lte: threshold } },
    orderBy: [{ stock: "asc" }, { id: "asc" }],
    take: limit,
    select: { id: true, title: true, author: true, coverUrl: true, stock: true },
  });
  return { threshold, items: books };
}