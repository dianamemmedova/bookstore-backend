import { Prisma, Role } from "../generated/prisma/client";
import type { Review } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { isPrismaError, PrismaErrorCode } from "../lib/prisma-errors";
import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors";
import type { CreateReviewInput, ListReviewsQuery, UpdateReviewInput } from "../schemas/review.schema";

type Viewer = { id: number; role: Role } | undefined;
type ReviewWithUser = Review & { user: { firstName: string; lastName: string } };

const withUser = { user: { select: { firstName: true, lastName: true } } } satisfies Prisma.ReviewInclude;

// "Əli Məmmədov" → "Əli M." (tam soyad hamıya göstərilmir)
function displayName(user: { firstName: string; lastName: string }) {
  const initial = user.lastName.trim().charAt(0);
  return initial ? `${user.firstName} ${initial.toUpperCase()}.` : user.firstName;
}

function present(review: ReviewWithUser, viewerId: number | undefined, myVote: boolean | null | undefined) {
  return {
    id: review.id,
    bookId: review.bookId,
    user: displayName(review.user),
    rating: review.rating,
    title: review.title,
    body: review.body,
    recommended: review.recommended,
    helpful: { yes: review.helpfulYes, no: review.helpfulNo },
    // Giriş edən istifadəçinin öz səsi: "yes" | "no" | null (səs verməyib və ya qonaqdır)
    myVote: myVote === undefined || myVote === null ? null : myVote ? "yes" : "no",
    isMine: viewerId !== undefined && viewerId === review.userId,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

async function requireBook(bookId: number) {
  const book = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true } });
  if (!book) throw new NotFoundError("Kitab");
}

// --- Oxumaq (qonaq da görə bilər) ---

const ORDER_BY: Record<ListReviewsQuery["sort"], Prisma.ReviewOrderByWithRelationInput[]> = {
  featured: [{ helpfulYes: "desc" }, { createdAt: "desc" }],
  newest: [{ createdAt: "desc" }],
  highest: [{ rating: "desc" }, { createdAt: "desc" }],
  lowest: [{ rating: "asc" }, { createdAt: "desc" }],
};

export async function listReviews(bookId: number, query: ListReviewsQuery, viewerId?: number) {
  await requireBook(bookId);

  // Xülasə həmişə kitabın BÜTÜN rəylərindən hesablanır (ulduz filtri onu dəyişmir)
  const [grouped, recommendedCount] = await Promise.all([
    prisma.review.groupBy({ by: ["rating"], where: { bookId }, _count: { _all: true } }),
    prisma.review.count({ where: { bookId, recommended: true } }),
  ]);
  const countByStar = new Map(grouped.map((row) => [row.rating, row._count._all]));
  const totalReviews = grouped.reduce((sum, row) => sum + row._count._all, 0);
  const ratingSum = grouped.reduce((sum, row) => sum + row.rating * row._count._all, 0);

  const where: Prisma.ReviewWhereInput = { bookId, ...(query.rating !== undefined && { rating: query.rating }) };
  const [rows, filteredTotal] = await Promise.all([
    prisma.review.findMany({
      where,
      include: withUser,
      orderBy: ORDER_BY[query.sort],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.review.count({ where }),
  ]);

  const myVotes = new Map<number, boolean>();
  if (viewerId !== undefined && rows.length > 0) {
    const votes = await prisma.reviewVote.findMany({ where: { userId: viewerId, reviewId: { in: rows.map((r) => r.id) } } });
    for (const vote of votes) myVotes.set(vote.reviewId, vote.helpful);
  }

  return {
    summary: {
      totalReviews,
      avgRating: totalReviews > 0 ? Math.round((ratingSum / totalReviews) * 10) / 10 : 0,
      recommendedPercent: totalReviews > 0 ? Math.round((recommendedCount / totalReviews) * 100) : 0,
      // [5★, 4★, 3★, 2★, 1★]: front-dakı ratingCounts ilə eyni forma
      ratingCounts: [5, 4, 3, 2, 1].map((star) => ({ star, count: countByStar.get(star) ?? 0 })),
    },
    items: rows.map((row) => present(row, viewerId, myVotes.get(row.id))),
    page: query.page,
    limit: query.limit,
    total: filteredTotal,
    totalPages: Math.ceil(filteredTotal / query.limit),
  };
}

// --- Yazmaq / dəyişmək / silmək ---

export async function createReview(userId: number, bookId: number, input: CreateReviewInput) {
  await requireBook(bookId);
  try {
    const review = await prisma.review.create({
      data: {
        userId,
        bookId,
        rating: input.rating,
        title: input.title,
        body: input.body,
        recommended: input.recommended ?? input.rating >= 4,
      },
      include: withUser,
    });
    return present(review, userId, null);
  } catch (error) {
    // (userId, bookId) unikallığı: yoxla-sonra-yaz yarışı yoxdur, baza özü qoruyur
    if (isPrismaError(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
      throw new ConflictError("Bu kitaba artıq rəy yazmısan. Mövcud rəyi dəyişə bilərsən", "REVIEW_ALREADY_EXISTS");
    }
    throw error;
  }
}

async function requireOwned(userId: number, id: number) {
  // Başqasının rəyi "yoxdur" kimi görünür (404)
  const review = await prisma.review.findFirst({ where: { id, userId }, select: { id: true } });
  if (!review) throw new NotFoundError("Rəy");
}

export async function updateReview(userId: number, id: number, input: UpdateReviewInput) {
  await requireOwned(userId, id);
  const review = await prisma.review.update({ where: { id }, data: input, include: withUser });
  const vote = await prisma.reviewVote.findUnique({ where: { reviewId_userId: { reviewId: id, userId } } });
  return present(review, userId, vote?.helpful);
}

// Öz rəyini istifadəçi, istənilən rəyi admin (moderasiya) silə bilər
export async function deleteReview(viewer: NonNullable<Viewer>, id: number) {
  const where = viewer.role === Role.ADMIN ? { id } : { id, userId: viewer.id };
  const result = await prisma.review.deleteMany({ where });
  if (result.count === 0) throw new NotFoundError("Rəy");
}

// --- "Faydalı oldu?" səsi ---

async function recount(tx: Prisma.TransactionClient, reviewId: number) {
  const [yes, no] = await Promise.all([
    tx.reviewVote.count({ where: { reviewId, helpful: true } }),
    tx.reviewVote.count({ where: { reviewId, helpful: false } }),
  ]);
  return tx.review.update({ where: { id: reviewId }, data: { helpfulYes: yes, helpfulNo: no }, include: withUser });
}

async function changeVote(userId: number, reviewId: number, helpful: boolean | null) {
  return prisma.$transaction(async (tx) => {
    // Rəy sətrini kilidləyirik: eyni rəyə paralel səslər növbə ilə işlənir, sayğac səhv çıxmır
    const locked = await tx.$queryRaw<{ id: number; user_id: number }[]>(
      Prisma.sql`SELECT id, user_id FROM reviews WHERE id = ${reviewId} FOR UPDATE`,
    );
    const target = locked[0];
    if (!target) throw new NotFoundError("Rəy");
    if (target.user_id === userId) throw new ForbiddenError("Öz rəyinə səs verə bilməzsən");

    if (helpful === null) {
      await tx.reviewVote.deleteMany({ where: { reviewId, userId } });
    } else {
      await tx.reviewVote.upsert({
        where: { reviewId_userId: { reviewId, userId } },
        create: { reviewId, userId, helpful },
        update: { helpful },
      });
    }
    const review = await recount(tx, reviewId);
    return present(review, userId, helpful);
  });
}

export const setVote = (userId: number, reviewId: number, helpful: "yes" | "no") =>
  changeVote(userId, reviewId, helpful === "yes");
export const removeVote = (userId: number, reviewId: number) => changeVote(userId, reviewId, null);