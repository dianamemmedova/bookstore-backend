import { beforeEach, describe, expect, it } from "vitest";
import { api, bearer, checkoutBody, dayPlus, makeAdmin, makeBook, makeUser, prisma, resetDb } from "./helpers";

let admin: Awaited<ReturnType<typeof makeAdmin>>;
let u: Awaited<ReturnType<typeof makeUser>>;

beforeEach(async () => {
  await resetDb();
  admin = await makeAdmin();
  u = await makeUser();
});

const addToCart = (token: string, bookId: number, quantity: number) =>
  api().put(`/cart/items/${bookId}`).set(bearer(token)).send({ quantity });
const order = (token: string, extra: Record<string, unknown> = {}) =>
  api().post("/orders").set(bearer(token)).send(checkoutBody(extra));
const stockOf = async (id: number) => (await prisma.book.findUniqueOrThrow({ where: { id } })).stock;

describe("Sifariş: hesablama", () => {
  it("60 AZN-dən az: çatdırılma 5 AZN əlavə olunur, səbət boşalır, stok azalır", async () => {
    const b = await makeBook({ price: 4, stock: 10 });
    await addToCart(u.token, b.id, 1);
    const res = await order(u.token);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "PENDING", subtotalCents: 400, discountCents: 0, deliveryFeeCents: 500, totalCents: 900 });
    expect((await api().get("/cart").set(bearer(u.token))).body.itemCount).toBe(0);
    expect(await stockOf(b.id)).toBe(9);
  });

  it("60 AZN və yuxarı: çatdırılma pulsuz (59.99 isə ödənişli)", async () => {
    const cheap = await makeBook({ price: 59.99, stock: 10 });
    await addToCart(u.token, cheap.id, 1);
    expect((await order(u.token)).body).toMatchObject({ deliveryFeeCents: 500, totalCents: 6499 });
    const b = await makeBook({ price: 60, stock: 10 });
    await addToCart(u.token, b.id, 1);
    const res = await order(u.token);
    expect(res.body).toMatchObject({ deliveryFeeCents: 0, totalCents: 6000 });
  });

  it("promo kod endirimi: 20% və endirimdən sonra məbləğə görə çatdırılma", async () => {
    await prisma.promoCode.create({ data: { code: "YAY20", discountPercent: 20, isActive: true } });
    const b = await makeBook({ price: 100, stock: 10 });
    await addToCart(u.token, b.id, 1);
    const res = await order(u.token, { promoCode: "yay20" });
    // 10000 - 2000 = 8000 ≥ 6000 → pulsuz çatdırılma
    expect(res.body).toMatchObject({ subtotalCents: 10000, discountCents: 2000, deliveryFeeCents: 0, totalCents: 8000 });
    // endirimdən sonra 60-dan aşağı düşərsə çatdırılma ödənişlidir: 70 AZN - 20% = 56 AZN
    const u2 = await makeUser();
    const b2 = await makeBook({ price: 70, stock: 10 });
    await addToCart(u2.token, b2.id, 1);
    expect((await order(u2.token, { promoCode: "YAY20" })).body).toMatchObject({ discountCents: 1400, deliveryFeeCents: 500, totalCents: 6100 });
  });

  it("promo yalnız bir dəfə işlənir: ikinci sifarişdə 409", async () => {
    await prisma.promoCode.create({ data: { code: "BIR", discountPercent: 10, isActive: true } });
    const b = await makeBook({ price: 10, stock: 10 });
    await addToCart(u.token, b.id, 1);
    expect((await order(u.token, { promoCode: "BIR" })).status).toBe(201);
    await addToCart(u.token, b.id, 1);
    const again = await order(u.token, { promoCode: "BIR" });
    expect(again.status).toBe(409);
    expect(await stockOf(b.id)).toBe(9); // ikinci sifariş geri qaytarıldı, stok toxunulmayıb
  });

  it("limitsiz stok (e-kitab, stock=null) azalmır", async () => {
    const b = await makeBook({ price: 10, stock: null });
    await addToCart(u.token, b.id, 3);
    expect((await order(u.token)).status).toBe(201);
    expect(await stockOf(b.id)).toBeNull();
  });

  it("snapshot: sonradan qiymət dəyişsə köhnə sifariş dəyişmir", async () => {
    const b = await makeBook({ price: 10, stock: 10 });
    await addToCart(u.token, b.id, 1);
    const o = (await order(u.token)).body;
    await prisma.book.update({ where: { id: b.id }, data: { priceCents: 9999, title: "Başqa ad" } });
    const got = (await api().get(`/orders/${o.id}`).set(bearer(u.token))).body;
    expect(got.items[0]).toMatchObject({ unitPriceCents: 1000 });
    expect(got.totalCents).toBe(o.totalCents);
  });
});

describe("Sifariş: rədd halları", () => {
  it("tokensiz 401, boş səbət 400 CART_EMPTY", async () => {
    expect((await api().post("/orders").send(checkoutBody())).status).toBe(401);
    const res = await order(u.token);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("CART_EMPTY");
  });

  it("kart məlumatı, məbləğ, yanlış payMethod göndərmək 400", async () => {
    const b = await makeBook({ price: 10 });
    await addToCart(u.token, b.id, 1);
    for (const extra of [{ cardNumber: "4111111111111111" }, { cvv: "123" }, { totalCents: 1 }, { payMethod: "BANK" }, { payMethod: "card" }]) {
      expect((await order(u.token, extra)).status, JSON.stringify(extra)).toBe(400);
    }
    expect((await order(u.token, { payMethod: "CARD" })).status).toBe(201);
  });

  it("çatdırılma tarixi: +4 gün 400, +5 gün 201, +91 gün 400, format səhvi 400", async () => {
    const b = await makeBook({ price: 10, stock: 20 });
    await addToCart(u.token, b.id, 1);
    for (const d of [dayPlus(4), dayPlus(91), "2020-01-01", "26.11.2026"]) {
      expect((await order(u.token, { deliveryDate: d })).status, d).toBe(400);
    }
    expect((await order(u.token, { deliveryDate: dayPlus(5) })).status).toBe(201);
  });

  it("stok çatmır: 409 INSUFFICIENT_STOCK, heç nə dəyişmir", async () => {
    const a = await makeBook({ price: 10, stock: 5 });
    const c = await makeBook({ price: 10, stock: 5 });
    await addToCart(u.token, a.id, 2);
    await addToCart(u.token, c.id, 2);
    await prisma.book.update({ where: { id: c.id }, data: { stock: 1 } });
    const res = await order(u.token);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(await stockOf(a.id)).toBe(5); // rollback: ilk kitabın stoku da azalmayıb
    expect(await prisma.order.count()).toBe(0);
    expect((await api().get("/cart").set(bearer(u.token))).body.itemCount).toBe(4); // səbət saxlanıb
  });
});

describe("Sifariş: sahiblik və ləğv", () => {
  it("başqasının sifarişi 404, siyahıda yalnız öz sifarişləri", async () => {
    const other = await makeUser();
    const b = await makeBook({ price: 10, stock: 10 });
    await addToCart(u.token, b.id, 1);
    const o = (await order(u.token)).body;
    expect((await api().get(`/orders/${o.id}`).set(bearer(other.token))).status).toBe(404);
    expect((await api().post(`/orders/${o.id}/cancel`).set(bearer(other.token))).status).toBe(404);
    expect((await api().get("/orders").set(bearer(other.token))).body.items).toHaveLength(0);
    expect((await api().get("/orders").set(bearer(u.token))).body.items).toHaveLength(1);
  });

  it("ləğv: stok qayıdır, promo yenidən istifadə oluna bilir; ikinci ləğv 409", async () => {
    await prisma.promoCode.create({ data: { code: "GERI", discountPercent: 10, isActive: true } });
    const b = await makeBook({ price: 10, stock: 10 });
    await addToCart(u.token, b.id, 2);
    const o = (await order(u.token, { promoCode: "GERI" })).body;
    expect(await stockOf(b.id)).toBe(8);
    const c = await api().post(`/orders/${o.id}/cancel`).set(bearer(u.token));
    expect(c.status).toBe(200);
    expect(c.body.status).toBe("CANCELLED");
    expect(await stockOf(b.id)).toBe(10);
    expect(await prisma.promoRedemption.count()).toBe(0);
    const again = await api().post(`/orders/${o.id}/cancel`).set(bearer(u.token));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ORDER_NOT_CANCELLABLE");
    expect(await stockOf(b.id)).toBe(10); // stok ikiqat qayıtmır
  });

  it("DELIVERED sifarişi ləğv etmək olmur", async () => {
    const b = await makeBook({ price: 10, stock: 10 });
    await addToCart(u.token, b.id, 1);
    const o = (await order(u.token)).body;
    for (const status of ["CONFIRMED", "DELIVERED"]) {
      expect((await api().patch(`/admin/orders/${o.id}/status`).set(bearer(admin.token)).send({ status })).status).toBe(200);
    }
    expect((await api().post(`/orders/${o.id}/cancel`).set(bearer(u.token))).status).toBe(409);
  });
});

describe("Sifariş: admin status keçidləri", () => {
  it("PENDING→DELIVERED atlamaq olmaz, düzgün ardıcıllıq olar, adi istifadəçi qadağan", async () => {
    const b = await makeBook({ price: 10, stock: 10 });
    await addToCart(u.token, b.id, 1);
    const o = (await order(u.token)).body;
    const patch = (token: string, status: string) => api().patch(`/admin/orders/${o.id}/status`).set(bearer(token)).send({ status });
    expect((await patch(u.token, "CONFIRMED")).status).toBe(403);
    const skip = await patch(admin.token, "DELIVERED");
    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe("INVALID_STATUS_TRANSITION");
    expect((await patch(admin.token, "CONFIRMED")).body.status).toBe("CONFIRMED");
    expect((await patch(admin.token, "BANANA")).status).toBe(400);
    const list = await api().get("/admin/orders?status=CONFIRMED").set(bearer(admin.token));
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
  });

  it("admin CANCELLED edəndə də stok qayıdır", async () => {
    const b = await makeBook({ price: 10, stock: 10 });
    await addToCart(u.token, b.id, 3);
    const o = (await order(u.token)).body;
    await api().patch(`/admin/orders/${o.id}/status`).set(bearer(admin.token)).send({ status: "CANCELLED" });
    expect(await stockOf(b.id)).toBe(10);
  });
});

describe("Sifariş: paralel sorğular (race condition)", () => {
  it("stok 3, 6 istifadəçi eyni anda 1 ədəd alır → düz 3 sifariş, stok 0", async () => {
    const b = await makeBook({ price: 10, stock: 3 });
    const users = await Promise.all(Array.from({ length: 6 }, () => makeUser()));
    for (const x of users) await addToCart(x.token, b.id, 1);
    const results = await Promise.all(users.map((x) => order(x.token)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    expect(await stockOf(b.id)).toBe(0);
  });

  it("eyni sifarişi paralel 5 dəfə ləğv etmək stoku yalnız bir dəfə qaytarır", async () => {
    const b = await makeBook({ price: 10, stock: 10 });
    await addToCart(u.token, b.id, 2);
    const o = (await order(u.token)).body;
    const results = await Promise.all(Array.from({ length: 5 }, () => api().post(`/orders/${o.id}/cancel`).set(bearer(u.token))));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await stockOf(b.id)).toBe(10);
  });

  it("eyni promo ilə paralel iki sifariş → yalnız biri keçir", async () => {
    await prisma.promoCode.create({ data: { code: "TEK", discountPercent: 10, isActive: true } });
    const b = await makeBook({ price: 10, stock: 10 });
    await addToCart(u.token, b.id, 1);
    // iki paralel sorğu eyni səbətlə: biri səbəti götürür, digəri ya boş səbət, ya promo konflikti alır
    const results = await Promise.all([order(u.token, { promoCode: "TEK" }), order(u.token, { promoCode: "TEK" })]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.promoRedemption.count()).toBe(1);
  });
});