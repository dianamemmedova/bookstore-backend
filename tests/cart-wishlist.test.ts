import { beforeAll, describe, expect, it } from "vitest";
import { api, bearer, makeBook, makeUser, resetDb } from "./helpers";

let u: Awaited<ReturnType<typeof makeUser>>;
let other: Awaited<ReturnType<typeof makeUser>>;
let book: Awaited<ReturnType<typeof makeBook>>;

beforeAll(async () => {
  await resetDb();
  u = await makeUser();
  other = await makeUser();
  book = await makeBook({ price: 7.5, stock: 5 });
});

describe("Səbət", () => {
  it("tokensiz 401", async () => {
    expect((await api().get("/cart")).status).toBe(401);
  });

  it("əlavə et, say dəyiş, cəmi bazadakı qiymətlə hesablanır", async () => {
    const put = await api().put(`/cart/items/${book.id}`).set(bearer(u.token)).send({ quantity: 2 });
    expect(put.status).toBe(200);
    const cart = (await api().get("/cart").set(bearer(u.token))).body;
    expect(cart).toMatchObject({ itemCount: 2, subtotalCents: 1500 });
    expect(cart.items[0].available).toBe(true);
  });

  it("yanlış say 400, olmayan kitab 404", async () => {
    for (const q of [0, -1, 100, 1.5, "2"]) {
      expect((await api().put(`/cart/items/${book.id}`).set(bearer(u.token)).send({ quantity: q })).status, String(q)).toBe(400);
    }
    expect((await api().put("/cart/items/99999999").set(bearer(u.token)).send({ quantity: 1 })).status).toBe(404);
  });

  it("stok azalanda available=false olur", async () => {
    const { prisma } = await import("./helpers");
    await prisma.book.update({ where: { id: book.id }, data: { stock: 1 } });
    const cart = (await api().get("/cart").set(bearer(u.token))).body;
    expect(cart.items[0].available).toBe(false);
    await prisma.book.update({ where: { id: book.id }, data: { stock: 5 } });
  });

  it("merge: qonaq səbətini birləşdirir (mövcud say üstünə gəlinir, stokdan çox olmur, olmayan kitab skipped)", async () => {
    const b2 = await makeBook({ price: 3 });
    const res = await api().post("/cart/merge").set(bearer(u.token)).send({ items: [{ bookId: b2.id, quantity: 2 }, { bookId: book.id, quantity: 1 }, { bookId: 99999999, quantity: 1 }] });
    expect(res.status).toBe(200);
    expect(res.body.cart.items.length).toBe(2);
    expect(res.body.cart.items.find((i: any) => i.bookId === book.id).quantity).toBe(3);
    expect(res.body.skipped).toEqual([{ bookId: 99999999, reason: "NOT_FOUND" }]);
    // stok 5-dir, 3 + 10 → 5-ə endirilir
    const capped = await api().post("/cart/merge").set(bearer(u.token)).send({ items: [{ bookId: book.id, quantity: 10 }] });
    expect(capped.body.cart.items.find((i: any) => i.bookId === book.id).quantity).toBe(5);
    expect(capped.body.adjusted).toEqual([{ bookId: book.id, quantity: 5 }]);
    expect((await api().post("/cart/merge").set(bearer(u.token)).send({ items: [] })).status).toBe(400);
  });

  it("səbət istifadəçiyə aiddir; silmək və təmizləmək", async () => {
    expect((await api().get("/cart").set(bearer(other.token))).body.itemCount).toBe(0);
    expect((await api().delete(`/cart/items/${book.id}`).set(bearer(u.token))).status).toBe(200);
    expect((await api().delete("/cart").set(bearer(u.token))).status).toBe(204);
    expect((await api().get("/cart").set(bearer(u.token))).body.itemCount).toBe(0);
  });
});

describe("İstək siyahıları", () => {
  it("yarat, kitab əlavə et, sil", async () => {
    const created = await api().post("/wishlists").set(bearer(u.token)).send({ name: "Yay oxuları" });
    expect(created.status).toBe(201);
    expect(created.body.isPublic).toBe(false);
    const id = created.body.id;
    expect((await api().put(`/wishlists/${id}/items/${book.id}`).set(bearer(u.token))).status).toBeLessThan(300);
    const got = await api().get(`/wishlists/${id}`).set(bearer(u.token));
    expect(got.status).toBe(200);
    expect(JSON.stringify(got.body)).toContain(String(book.id));
    expect((await api().delete(`/wishlists/${id}/items/${book.id}`).set(bearer(u.token))).status).toBe(200);
  });

  it("validasiya: boş ad 400", async () => {
    expect((await api().post("/wishlists").set(bearer(u.token)).send({ name: "  " })).status).toBe(400);
    expect((await api().post("/wishlists").set(bearer(u.token)).send({ name: "x", owner: 1 })).status).toBe(400);
  });

  it("başqasının siyahısı 404; gizli siyahı ictimai linkdə 404, açıq olanda 200", async () => {
    const id = (await api().post("/wishlists").set(bearer(u.token)).send({ name: "Gizli" })).body.id;
    expect((await api().get(`/wishlists/${id}`).set(bearer(other.token))).status).toBe(404);
    expect((await api().patch(`/wishlists/${id}`).set(bearer(other.token)).send({ name: "Oğurluq" })).status).toBe(404);
    expect((await api().delete(`/wishlists/${id}`).set(bearer(other.token))).status).toBe(404);
    expect((await api().get(`/public/wishlists/${id}`)).status).toBe(404);
    await api().patch(`/wishlists/${id}`).set(bearer(u.token)).send({ isPublic: true });
    expect((await api().get(`/public/wishlists/${id}`)).status).toBe(200);
  });
});