import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { isPrismaError, PrismaErrorCode } from "../lib/prisma-errors";
import { ConflictError, NotFoundError } from "../lib/errors";
import { presentBook } from "../lib/book-presenter";
import type { CreateWishlistInput, UpdateWishlistInput } from "../schemas/wishlist.schema";

const MAX_WISHLISTS = 20;
const MAX_ITEMS = 200;

const detailInclude = {
  items: { include: { book: true }, orderBy: { id: "desc" } },
} satisfies Prisma.WishlistInclude;

type WishlistWithItems = Prisma.WishlistGetPayload<{ include: typeof detailInclude }>;

function presentDetail(wishlist: WishlistWithItems) {
  return {
    id: wishlist.id,
    name: wishlist.name,
    isPublic: wishlist.isPublic,
    createdAt: wishlist.createdAt,
    updatedAt: wishlist.updatedAt,
    itemCount: wishlist.items.length,
    items: wishlist.items.map((item) => ({
      bookId: item.bookId,
      addedAt: item.createdAt,
      book: presentBook(item.book),
    })),
  };
}

// Siyahı yalnız sahibinə məxsusdur. Başqasının siyahısı üçün də 404 veririk ki, onun mövcudluğu bilinməsin.
async function requireOwned(userId: number, id: number) {
  const wishlist = await prisma.wishlist.findFirst({ where: { id, userId } });
  if (!wishlist) throw new NotFoundError("Siyahı");
  return wishlist;
}

async function getDetail(id: number) {
  const wishlist = await prisma.wishlist.findUniqueOrThrow({ where: { id }, include: detailInclude });
  return presentDetail(wishlist);
}

function nameTaken(error: unknown): never {
  if (isPrismaError(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
    throw new ConflictError("Bu adlı siyahı artıq var", "WISHLIST_NAME_TAKEN");
  }
  throw error;
}

export async function listMine(userId: number) {
  const rows = await prisma.wishlist.findMany({
    where: { userId },
    include: { _count: { select: { items: true } } },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isPublic: row.isPublic,
    itemCount: row._count.items,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function createWishlist(userId: number, input: CreateWishlistInput) {
  const count = await prisma.wishlist.count({ where: { userId } });
  if (count >= MAX_WISHLISTS) {
    throw new ConflictError(`Ən çox ${MAX_WISHLISTS} siyahı yarada bilərsən`, "WISHLIST_LIMIT");
  }

  try {
    const wishlist = await prisma.wishlist.create({ data: { userId, ...input }, include: detailInclude });
    return presentDetail(wishlist);
  } catch (error) {
    return nameTaken(error);
  }
}

export async function getMine(userId: number, id: number) {
  await requireOwned(userId, id);
  return getDetail(id);
}

export async function updateWishlist(userId: number, id: number, input: UpdateWishlistInput) {
  await requireOwned(userId, id);
  try {
    await prisma.wishlist.update({ where: { id }, data: input });
  } catch (error) {
    return nameTaken(error);
  }
  return getDetail(id);
}

export async function deleteWishlist(userId: number, id: number): Promise<void> {
  await requireOwned(userId, id);
  await prisma.wishlist.delete({ where: { id } });
}

export async function addItem(userId: number, id: number, bookId: number) {
  await requireOwned(userId, id);

  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) throw new NotFoundError("Kitab");

  const already = await prisma.wishlistItem.findUnique({ where: { wishlistId_bookId: { wishlistId: id, bookId } } });
  if (!already) {
    const count = await prisma.wishlistItem.count({ where: { wishlistId: id } });
    if (count >= MAX_ITEMS) {
      throw new ConflictError(`Siyahıda ən çox ${MAX_ITEMS} kitab ola bilər`, "WISHLIST_FULL");
    }
    await prisma.wishlistItem.create({ data: { wishlistId: id, bookId } });
  }
  return getDetail(id);
}

export async function removeItem(userId: number, id: number, bookId: number) {
  await requireOwned(userId, id);
  // deleteMany: kitab siyahıda yoxdursa da xəta yoxdur (nəticə eynidir)
  await prisma.wishlistItem.deleteMany({ where: { wishlistId: id, bookId } });
  return getDetail(id);
}

// Hamı üçün açıq baxış: yalnız isPublic olan siyahı. Gizli olanda 404.
export async function getPublic(id: number) {
  const wishlist = await prisma.wishlist.findFirst({
    where: { id, isPublic: true },
    include: { ...detailInclude, user: { select: { firstName: true } } },
  });
  if (!wishlist) throw new NotFoundError("Siyahı");
  // Sahibin yalnız adı göstərilir: email, soyad, id açıqlanmır
  return { ...presentDetail(wishlist), owner: { firstName: wishlist.user.firstName } };
}