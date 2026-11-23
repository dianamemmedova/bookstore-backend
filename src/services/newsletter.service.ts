import { prisma } from "../lib/prisma";
import { NotFoundError } from "../lib/errors";

// Eyni cavab həmişə: email-in bazada olub-olmaması sızmır. Təkrar abunə xəta deyil (idempotent).
export async function subscribe(email: string) {
  await prisma.newsletterSubscriber.upsert({
    where: { email },
    create: { email },
    // Əvvəl çıxıbsa yenidən aktiv edirik
    update: { isActive: true, unsubscribedAt: null },
  });
  return { message: "Abunəliyiniz qeydə alındı" };
}

export async function unsubscribe(token: string) {
  const result = await prisma.newsletterSubscriber.updateMany({
    where: { unsubscribeToken: token },
    data: { isActive: false, unsubscribedAt: new Date() },
  });
  if (result.count === 0) throw new NotFoundError("Abunəlik");
  return { message: "Abunəlikdən çıxdınız" };
}

// --- Admin ---

export async function listSubscribers({ page, limit, active }: { page: number; limit: number; active?: boolean }) {
  const where = active === undefined ? {} : { isActive: active };
  const [rows, total, activeCount] = await Promise.all([
    prisma.newsletterSubscriber.findMany({ where, orderBy: { id: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.newsletterSubscriber.count({ where }),
    prisma.newsletterSubscriber.count({ where: { isActive: true } }),
  ]);
  // unsubscribeToken admin-ə də göstərilmir
  const items = rows.map(({ unsubscribeToken: _token, ...rest }) => rest);
  return { items, activeCount, page, limit, total, totalPages: Math.ceil(total / limit) };
}