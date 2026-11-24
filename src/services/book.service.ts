import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { NotFoundError } from "../lib/errors";
import { presentAdminBook, presentBook } from "../lib/book-presenter";
import { deleteCover, saveCover } from "../lib/cover-storage";
import type { AdminListBooksQuery, CreateBookInput, ListBooksQuery, UpdateBookInput } from "../schemas/book.schema";

const ORDER_BY: Record<ListBooksQuery["sort"], Prisma.BookOrderByWithRelationInput> = {
  newest: { id: "desc" },
  title: { title: "asc" },
  "year-desc": { year: { sort: "desc", nulls: "last" } },
  "price-asc": { priceCents: "asc" },
  "price-desc": { priceCents: "desc" },
};

// Axtarış sözləri: "american history" → ["american", "history"]. Hər söz başlıqda, müəllifdə və ya mövzu teqində axtarılır.
function searchWords(q: string) {
  return q.toLowerCase().split(/\s+/).filter((w) => w.length >= 2).slice(0, 6);
}

function textCondition(q: string, mode: "all" | "any"): Prisma.BookWhereInput {
  const words = searchWords(q);
  if (words.length === 0) {
    return { OR: [{ title: { contains: q, mode: "insensitive" } }, { author: { contains: q, mode: "insensitive" } }] };
  }
  const conditions = words.map<Prisma.BookWhereInput>((word) => ({
    OR: [
      { title: { contains: word, mode: "insensitive" } },
      { author: { contains: word, mode: "insensitive" } },
      { subjects: { has: word } },
    ],
  }));
  return mode === "all" ? { AND: conditions } : { OR: conditions };
}

const LOW_STOCK_LIMIT = 5; // stats.service-dəki ilə eyni

function stockCondition(status: AdminListBooksQuery["stockStatus"]): Prisma.BookWhereInput {
  switch (status) {
    case "out": return { stock: 0 };
    case "low": return { stock: { gt: 0, lte: LOW_STOCK_LIMIT } };
    case "unlimited": return { stock: null };
    case "in": return { OR: [{ stock: null }, { stock: { gt: 0 } }] };
    default: return {};
  }
}

async function findBooks(query: ListBooksQuery & Pick<AdminListBooksQuery, "stockStatus">) {
  const { page, limit, q, subject, minPrice, maxPrice, sort, stockStatus } = query;

  const baseWhere: Prisma.BookWhereInput = {
    ...(subject && { subjects: { has: subject.toLowerCase() } }),
    ...((minPrice !== undefined || maxPrice !== undefined) && {
      priceCents: {
        ...(minPrice !== undefined && { gte: Math.round(minPrice * 100) }),
        ...(maxPrice !== undefined && { lte: Math.round(maxPrice * 100) }),
      },
    }),
  };
  const filters: Prisma.BookWhereInput[] = [baseWhere, stockCondition(stockStatus)];

  // Əvvəl bütün sözlər uyğun gəlməlidir; heç nə tapılmasa və çox söz varsa, hər hansı biri uyğun gəlsin
  let where: Prisma.BookWhereInput = { AND: q ? [...filters, textCondition(q, "all")] : filters };
  let total = await prisma.book.count({ where });
  if (q && total === 0 && searchWords(q).length > 1) {
    where = { AND: [...filters, textCondition(q, "any")] };
    total = await prisma.book.count({ where });
  }

  const books = await prisma.book.findMany({
    where,
    // id ikinci açar kimi: eyni qiymətli kitablar səhifələr arasında yerini dəyişməsin
    orderBy: [ORDER_BY[sort], { id: "asc" }],
    skip: (page - 1) * limit,
    take: limit,
  });

  return { books, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function listBooks(query: ListBooksQuery) {
  const { books, ...meta } = await findBooks(query);
  return { items: books.map(presentBook), ...meta };
}

// Admin: dəqiq stok və stok filtri ilə
export async function listBooksAdmin(query: AdminListBooksQuery) {
  const { books, ...meta } = await findBooks(query);
  return { items: books.map(presentAdminBook), ...meta };
}

export async function getBook(id: string) {
  const book = await prisma.book.findUnique({ where: { id: Number(id) } });
  if (!book) throw new NotFoundError("Kitab");
  return presentBook(book);
}

// --- Admin əməliyyatları ---

// Admin qiyməti AZN ilə göndərir, bazada qəpik kimi saxlanır
function toCents(price: number) {
  return Math.round(price * 100);
}

export async function createBook(input: CreateBookInput) {
  const { price, ...rest } = input;
  const book = await prisma.book.create({ data: { ...rest, priceCents: toCents(price) } });
  return presentAdminBook(book);
}

export async function updateBook(id: string, input: UpdateBookInput) {
  const { price, ...rest } = input;
  // Kitab yoxdursa Prisma P2025 atır, error handler onu 404-ə çevirir
  const book = await prisma.book.update({
    where: { id: Number(id) },
    data: { ...rest, ...(price !== undefined && { priceCents: toCents(price) }) },
  });
  return presentAdminBook(book);
}

export async function deleteBook(id: string): Promise<void> {
  // Sifarişlərdə istifadə olunan kitabı silməyə baza icazə verməyəcək (409 RELATION_CONFLICT)
  const book = await prisma.book.delete({ where: { id: Number(id) } });
  await deleteCover(book.coverUrl);
}

export async function setBookCover(id: string, file: Buffer) {
  const existing = await prisma.book.findUnique({ where: { id: Number(id) } });
  if (!existing) throw new NotFoundError("Kitab");

  const coverUrl = await saveCover(file);
  const book = await prisma.book.update({ where: { id: existing.id }, data: { coverUrl } });
  await deleteCover(existing.coverUrl);
  return presentAdminBook(book);
}