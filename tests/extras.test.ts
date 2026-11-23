import { beforeAll, describe, expect, it } from "vitest";
import { api, bearer, makeAdmin, makeUser, prisma, resetDb } from "./helpers";

let admin: Awaited<ReturnType<typeof makeAdmin>>;
let user: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  await resetDb();
  admin = await makeAdmin();
  user = await makeUser();
});

const valid = { name: "Test", email: "t@test.az", subject: "Sifariş haqqında", message: "Salam, bu kifayət qədər uzun mesajdır." };

describe("Əlaqə mesajları", () => {
  it("validasiya", async () => {
    const subjects = await prisma.contactMessage.count();
    for (const bad of [{}, { ...valid, message: "qısa" }, { ...valid, email: "abc" }, { ...valid, subject: "Reklam" }, { ...valid, isRead: true }]) {
      expect((await api().post("/contact").send(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(await prisma.contactMessage.count()).toBe(subjects);
  });

  it("qonaq və istifadəçi göndərə bilir; yanlış token 401", async () => {
    expect((await api().post("/contact").send(valid)).status).toBeLessThan(300);
    const logged = await api().post("/contact").set(bearer(user.token)).send(valid);
    expect(logged.status).toBeLessThan(300);
    expect((await prisma.contactMessage.findFirst({ orderBy: { id: "desc" } }))?.userId).toBe(user.id);
    expect((await api().post("/contact").set(bearer("yalan")).send(valid)).status).toBe(401);
  });

  it("admin siyahı, oxunmuş işarələ, sil; adi istifadəçi 403", async () => {
    expect((await api().get("/admin/contact-messages").set(bearer(user.token))).status).toBe(403);
    const list = (await api().get("/admin/contact-messages?unread=true").set(bearer(admin.token))).body.items;
    expect(list.length).toBeGreaterThanOrEqual(2);
    const id = list[0].id;
    expect((await api().patch(`/admin/contact-messages/${id}`).set(bearer(admin.token)).send({ isRead: true })).status).toBe(200);
    const after = (await api().get("/admin/contact-messages?unread=true").set(bearer(admin.token))).body.items;
    expect(after.some((m: any) => m.id === id)).toBe(false);
    expect((await api().get("/admin/contact-messages?unread=abc").set(bearer(admin.token))).status).toBe(400);
    expect((await api().delete(`/admin/contact-messages/${id}`).set(bearer(admin.token))).status).toBe(204);
    expect((await api().delete(`/admin/contact-messages/${id}`).set(bearer(admin.token))).status).toBe(404);
  });
});

describe("Bülleten", () => {
  it("abunə idempotentdir, email kiçik hərfə çevrilir, cavabda token yoxdur", async () => {
    const first = await api().post("/newsletter/subscribe").send({ email: "Abune@Test.AZ" });
    const second = await api().post("/newsletter/subscribe").send({ email: "abune@test.az" });
    expect(first.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(JSON.stringify(first.body)).not.toMatch(/unsubscribeToken/);
    expect(await prisma.newsletterSubscriber.count({ where: { email: "abune@test.az" } })).toBe(1);
    expect((await api().post("/newsletter/subscribe").send({ email: "abc" })).status).toBe(400);
  });

  it("çıxmaq: yanlış token 404, düzgün token 200; admin siyahısı token göstərir", async () => {
    const list = (await api().get("/admin/newsletter").set(bearer(admin.token))).body.items;
    const sub = await prisma.newsletterSubscriber.findFirstOrThrow({ where: { email: "abune@test.az" } });
    expect(list.some((s: any) => s.email === "abune@test.az")).toBe(true);
    expect((await api().post("/newsletter/unsubscribe").send({ token: "yalan-token-yalan" })).status).toBe(404);
    expect((await api().post("/newsletter/unsubscribe").send({ token: sub.unsubscribeToken })).status).toBe(200);
    expect((await api().get("/admin/newsletter?active=false").set(bearer(admin.token))).body.items.some((s: any) => s.email === "abune@test.az")).toBe(true);
    expect((await api().get("/admin/newsletter").set(bearer(user.token))).status).toBe(403);
  });
});

describe("Hədiyyə kartı", () => {
  it("yaradılır (16 rəqəm, '4521' ilə başlayır), balans yoxlanır, boşluqlu format işləyir", async () => {
    expect((await api().post("/admin/gift-cards").set(bearer(user.token)).send({ amount: 50 })).status).toBe(403);
    for (const bad of [{ amount: 0 }, { amount: 10.123 }, { amount: 10, balanceCents: 99999 }]) {
      expect((await api().post("/admin/gift-cards").set(bearer(admin.token)).send(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    const card = (await api().post("/admin/gift-cards").set(bearer(admin.token)).send({ amount: 150 })).body;
    expect(card.code).toMatch(/^4521\d{12}$/);
    const ok = await api().post("/gift-cards/balance").send({ cardNumber: card.code });
    expect(ok.body).toMatchObject({ balance: 150, balanceCents: 15000 });
    expect(JSON.stringify(ok.body)).not.toContain(card.code);
    const spaced = `${card.code.slice(0, 4)} ${card.code.slice(4, 8)} ${card.code.slice(8, 12)} ${card.code.slice(12)}`;
    expect((await api().post("/gift-cards/balance").send({ cardNumber: spaced })).body.balance).toBe(150);
  });

  it("olmayan, söndürülmüş və vaxtı bitmiş kart EYNİ 404 cavabını verir; format səhvi 400", async () => {
    const off = (await api().post("/admin/gift-cards").set(bearer(admin.token)).send({ amount: 30 })).body;
    await api().patch(`/admin/gift-cards/${off.id}`).set(bearer(admin.token)).send({ isActive: false });
    const expired = (await api().post("/admin/gift-cards").set(bearer(admin.token)).send({ amount: 20, expiresAt: "2020-01-01T00:00:00Z" })).body;
    const bodies = [];
    for (const cardNumber of ["1234123412341234", off.code, expired.code]) {
      const r = await api().post("/gift-cards/balance").send({ cardNumber });
      expect(r.status).toBe(404);
      bodies.push(r.body.error.code + r.body.error.message);
    }
    expect(new Set(bodies).size).toBe(1);
    for (const cardNumber of ["123456789012345", "abcdabcdabcdabcd"]) {
      expect((await api().post("/gift-cards/balance").send({ cardNumber })).status).toBe(400);
    }
  });
});