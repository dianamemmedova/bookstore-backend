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
  priceCents: number; // adi qiymət (qəpik)
  price: number; // adi qiymət (AZN)
  discountPercent: number; // 0 = endirim yoxdur
  salePriceCents: number; // müştərinin ödəyəcəyi qiymət (endirimlə)
  salePrice: number;
  isAudiobook: boolean;
  hasAudio: boolean; // audio fayl yüklənib (fayl adı və ya yolu heç vaxt göstərilmir)
  inStock: boolean;
};

// Bazadakı sətri müştəriyə göstərəcəyimiz formaya çevirir.
// stock null = limitsiz (e-kitab), 0 = qurtarıb.
// Endirimli satış qiyməti, qəpiyə yuvarlaqlanır. Səbət və sifariş də eyni düsturu işlədir.
export function salePriceCents(priceCents: number, discountPercent: number): number {
  return Math.round((priceCents * (100 - discountPercent)) / 100);
}

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
    discountPercent: book.discountPercent,
    salePriceCents: salePriceCents(book.priceCents, book.discountPercent),
    salePrice: salePriceCents(book.priceCents, book.discountPercent) / 100,
    isAudiobook: book.isAudiobook,
    hasAudio: book.audioFile !== null,
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