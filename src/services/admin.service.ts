import { prisma } from "../lib/prisma";
import { publicUserSelect } from "./auth.service";
import type { PaginationQuery } from "../schemas/common.schema";

export async function listUsers({ page, limit }: PaginationQuery) {
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      select: publicUserSelect,
      orderBy: { id: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count(),
  ]);

  return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
}