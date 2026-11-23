import request from "supertest";
import bcrypt from "bcryptjs";
import app from "../src/app";
import { prisma } from "../src/lib/prisma";
import { signToken } from "../src/lib/jwt";
import type { Role } from "../src/generated/prisma/client";

export { app, prisma };
export const api = () => request(app);
export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// Bütün cədvəlləri boşaldır (migrasiya cədvəli istisna). Hər test faylı bundan başlayır.
export async function resetDb() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

let counter = 0;
const PASSWORD = "Parol12345";

// İstifadəçini birbaşa bazada yaradır və token verir (qeydiyyat limitinə düşmür, sürətlidir)
export async function makeUser(opts: { role?: Role; email?: string; firstName?: string; lastName?: string } = {}) {
  counter++;
  const email = opts.email ?? `user${counter}@test.az`;
  const user = await prisma.user.create({
    data: {
      email,
      firstName: opts.firstName ?? "Test",
      lastName: opts.lastName ?? "User",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: opts.role ?? "USER",
    },
  });
  return { id: user.id, email, password: PASSWORD, token: signToken({ sub: user.id, email, role: user.role }) };
}
export const makeAdmin = () => makeUser({ role: "ADMIN", firstName: "Admin" });

export async function makeBook(opts: { price?: number; stock?: number | null; title?: string } = {}) {
  counter++;
  return prisma.book.create({
    data: {
      title: opts.title ?? `Kitab ${counter}`,
      author: "Müəllif",
      subjects: [],
      priceCents: Math.round((opts.price ?? 10) * 100),
      stock: opts.stock === undefined ? 10 : opts.stock,
    },
  });
}

// Bakı vaxtı ilə bu gündən n gün sonra: "2026-11-29"
export function dayPlus(n: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baku" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const checkoutBody = (extra: Record<string, unknown> = {}) => ({
  payMethod: "CASH",
  fullName: "Test Tester",
  phone: "+994501234567",
  city: "Bakı",
  street: "Nizami küç.",
  building: "10",
  apartment: "5",
  deliveryDate: dayPlus(6),
  ...extra,
});