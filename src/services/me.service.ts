import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { BadRequestError, UnauthorizedError } from "../lib/errors";
import { publicUserSelect, SALT_ROUNDS } from "./auth.service";
import type { ChangePasswordInput, UpdateMeInput } from "../schemas/me.schema";

export async function getMe(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...publicUserSelect, marketingOptIn: true },
  });

  // Token etibarlıdır, amma istifadəçi bazadan silinib
  if (!user) throw new UnauthorizedError("İstifadəçi tapılmadı");
  return user;
}

export async function updateMe(userId: number, data: UpdateMeInput) {
  return prisma.user.update({
    where: { id: userId },
    data,
    select: { ...publicUserSelect, marketingOptIn: true },
  });
}

export async function changePassword(userId: number, input: ChangePasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError("İstifadəçi tapılmadı");

  const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!valid) {
    // 401 yox, 400: frontend 401 görəndə istifadəçini çıxışa göndərə bilər
    throw new BadRequestError("Cari parol yanlışdır", "WRONG_PASSWORD");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}