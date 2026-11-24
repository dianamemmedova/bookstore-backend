import type { Book } from "../generated/prisma/client";

export type PublicBook = {
  id: number;
  externalId: string | null;
  title: string;
  author: string;
  description: string | null;
  coverUrl: string | null;
  year: number | null;
  pages: number | null;
  subjects: string[];
  priceCents: number;
  price: number;
  inStock: boolean;
};

// Bazadakı sətri müştəriyə göstərəcəyimiz formaya çevirir.
// stock null = limitsiz (e-kitab), 0 = qurtarıb.
export function presentBook(book: Book): PublicBook {
  return {
    id: book.id,
    externalId: book.externalId,
    title: book.title,
    author: book.author,
    description: book.description,
    coverUrl: book.coverUrl,
    year: book.year,
    pages: book.pages,
    subjects: book.subjects,
    priceCents: book.priceCents,
    price: book.priceCents / 100,
    inStock: book.stock === null || book.stock > 0,
  };
}

// Admin panel üçün: dəqiq stok və tarixlər də görünür (müştəriyə göstərilmir)
export type AdminBook = PublicBook & {
  stock: number | null;
  createdAt: string;
  updatedAt: string;
};

export function presentAdminBook(book: Book): AdminBook {
  return {
    ...presentBook(book),
    stock: book.stock,
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  };
}