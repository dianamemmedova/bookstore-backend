import { beforeAll, describe, expect, it } from "vitest";
import { api, bearer, checkoutBody, makeAdmin, makeBook, makeUser, prisma, resetDb } from "./helpers";

let admin: Awaited<ReturnType<typeof makeAdmin>>;
let user: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  await resetDb();
  admin = await makeAdmin();
  user = await makeUser();
});

describe("Endirim və audio kitab: admin", () => {
  it("yaratmada endirim və audio işarəsi saxlanır, satış qiyməti hesablanır", async () => {
    const res = await api()
      .post("/admin/books")
      .set(bearer(admin.token))
      .send({ title: "Endirimli", author: "A", price: 20, discountPercent: 25, isAudiobook: true });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ priceCents: 2000, discountPercent: 25, salePriceCents: 1500, salePrice: 15, isAudiobook: true });
  });

  it("verilməsə default: endirim 0, audio deyil, satış qiyməti = adi qiymət", async () => {
    const res = await api().post("/admin/books").set(bearer(admin.token)).send({ title: "Adi", author: "A", price: 10 });
    expect(res.body).toMatchObject({ discountPercent: 0, isAudiobook: false, salePriceCents: 1000 });
  });

  it("PATCH ilə dəyişir; yanlış dəyərlər 400", async () => {
    const b = await makeBook({ price: 10 });
    const ok = await api().patch(`/admin/books/${b.id}`).set(bearer(admin.token)).send({ discountPercent: 50 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ discountPercent: 50, salePriceCents: 500 });
    for (const bad of [{ discountPercent: -1 }, { discountPercent: 91 }, { discountPercent: 10.5 }, { isAudiobook: "yes" }]) {
      expect((await api().patch(`/admin/books/${b.id}`).set(bearer(admin.token)).send(bad)).status, JSON.stringify(bad)).toBe(400);
    }
  });

  it("satış qiyməti qəpiyə yuvarlaqlanır", async () => {
    const b = await makeBook({ price: 9.99, discountPercent: 15 });
    const res = await api().get(`/books/${b.id}`);
    expect(res.body.salePriceCents).toBe(849); // 999 * 0.85 = 849.15
  });
});

describe("Endirim və audio kitab: filtrlər", () => {
  it("discounted=true yalnız endirimliləri, audiobook=true yalnız audio kitabları qaytarır", async () => {
    await resetDb();
    admin = await makeAdmin();
    await makeBook({ title: "Adi" });
    await makeBook({ title: "Endirimli", discountPercent: 20 });
    await makeBook({ title: "Audio", isAudiobook: true });

    const disc = await api().get("/books?discounted=true");
    expect(disc.body.items.map((b: { title: string }) => b.title)).toEqual(["Endirimli"]);

    const audio = await api().get("/books?audiobook=true");
    expect(audio.body.items.map((b: { title: string }) => b.title)).toEqual(["Audio"]);

    const notAudio = await api().get("/books?audiobook=false");
    expect(notAudio.body.total).toBe(2);

    expect((await api().get("/books?discounted=maybe")).status).toBe(400);
  });
});

describe("Endirim: səbət və sifariş", () => {
  it("səbət və sifariş endirimli qiymətlə hesablanır, sifariş qiyməti saxlanır", async () => {
    await resetDb();
    user = await makeUser();
    const b = await makeBook({ price: 10, discountPercent: 20, stock: 5 });
    await api().put(`/cart/items/${b.id}`).set(bearer(user.token)).send({ quantity: 2 });

    const cart = (await api().get("/cart").set(bearer(user.token))).body;
    expect(cart).toMatchObject({ subtotalCents: 1600 }); // 2 × 8.00
    expect(cart.items[0]).toMatchObject({ lineTotalCents: 1600 });

    const res = await api().post("/orders").set(bearer(user.token)).send(checkoutBody());
    expect(res.status).toBe(201);
    expect(res.body.subtotalCents).toBe(1600);
    expect(res.body.items[0].unitPriceCents).toBe(800);

    // sonradan endirim dəyişsə, köhnə sifariş dəyişmir
    await prisma.book.update({ where: { id: b.id }, data: { discountPercent: 0 } });
    const again = (await api().get(`/orders/${res.body.id}`).set(bearer(user.token))).body;
    expect(again.items[0].unitPriceCents).toBe(800);
  });
});