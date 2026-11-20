import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { NotFoundError } from "../lib/errors";
import { presentBook } from "../lib/book-presenter";
import { deleteCover, saveCover } from "../lib/cover-storage";
import type { CreateBookInput, ListBooksQuery, UpdateBookInput } from "../schemas/book.schema";

const ORDER_BY: Record<ListBooksQuery["sort"], Prisma.BookOrderByWithRelationInput> = {
  newest: { id: "desc" },
  title: { title: "asc" },
  "year-desc": { year: { sort: "desc", nulls: "last" } },
  "price-asc": { priceCents: "asc" },
  "price-desc": { priceCents: "desc" },
};

export async function listBooks(query: ListBooksQuery) {
  const { page, limit, q, subject, minPrice, maxPrice, sort } = query;

  const where: Prisma.BookWhereInput = {
    ...(q && {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { author: { contains: q, mode: "insensitive" } },
      ],
    }),
    ...(subject && { subjects: { has: subject } }),
    ...((minPrice !== undefined || maxPrice !== undefined) && {
      priceCents: {
        ...(minPrice !== undefined && { gte: Math.round(minPrice * 100) }),
        ...(maxPrice !== undefined && { lte: Math.round(maxPrice * 100) }),
      },
    }),
  };

  const [books, total] = await Promise.all([
    prisma.book.findMany({
      where,
      // id ikinci açar kimi: eyni qiymətli kitablar səhifələr arasında yerini dəyişməsin
      orderBy: [ORDER_BY[sort], { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.book.count({ where }),
  ]);

  return {
    items: books.map(presentBook),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
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
  return presentBook(book);
}

export async function updateBook(id: string, input: UpdateBookInput) {
  const { price, ...rest } = input;
  // Kitab yoxdursa Prisma P2025 atır, error handler onu 404-ə çevirir
  const book = await prisma.book.update({
    where: { id: Number(id) },
    data: { ...rest, ...(price !== undefined && { priceCents: toCents(price) }) },
  });
  return presentBook(book);
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
  return presentBook(book);
}