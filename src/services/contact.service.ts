import { prisma } from "../lib/prisma";
import { NotFoundError } from "../lib/errors";
import type { ContactInput } from "../schemas/contact.schema";

export async function createContactMessage(input: ContactInput, userId?: number) {
  await prisma.contactMessage.create({ data: { ...input, userId: userId ?? null } });
  return { message: "Mesajınız qəbul edildi. Tezliklə cavab verəcəyik" };
}

// --- Admin ---

export async function listContactMessages({ page, limit, unread }: { page: number; limit: number; unread?: boolean }) {
  const where = unread === undefined ? {} : { isRead: !unread };
  const [items, total, unreadCount] = await Promise.all([
    prisma.contactMessage.findMany({ where, orderBy: { id: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.contactMessage.count({ where }),
    prisma.contactMessage.count({ where: { isRead: false } }),
  ]);
  return { items, unreadCount, page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function markContactRead(id: number, isRead: boolean) {
  // Mesaj yoxdursa Prisma P2025 atır, error handler onu 404-ə çevirir
  return prisma.contactMessage.update({ where: { id }, data: { isRead } });
}

export async function deleteContactMessage(id: number) {
  const result = await prisma.contactMessage.deleteMany({ where: { id } });
  if (result.count === 0) throw new NotFoundError("Mesaj");
}