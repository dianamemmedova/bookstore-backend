import { beforeAll, describe, expect, it } from "vitest";
import { api, bearer, checkoutBody, dayPlus, makeAdmin, makeBook, makeUser, resetDb } from "./helpers";

let admin: Awaited<ReturnType<typeof makeAdmin>>;
let u: Awaited<ReturnType<typeof makeUser>>;
let A: number, B: number, C: number, D: number, E: number;

const g = (path: string) => api().get(`/admin/stats/${path}`).set(bearer(admin.token));
const put = (id: number, quantity: number) => api().put(`/cart/items/${id}`).set(bearer(u.token)).send({ quantity });
const order = async () => (await api().post("/orders").set(bearer(u.token)).send(checkoutBody())).body;
const status = (id: number, s: string) => api().patch(`/admin/orders/${id}/status`).set(bearer(admin.token)).send({ status: s });

beforeAll(async () => {
  await resetDb(); // təmiz baza: rəqəmlər dəqiq müqayisə olunur
  admin = await makeAdmin();
  u = await makeUser();
  A = (await makeBook({ price: 10, stock: 50 })).id;
  B = (await makeBook({ price: 20, stock: 50 })).id;
  C = (await makeBook({ price: 5, stock: 2 })).id;
  D = (await makeBook({ price: 5, stock: 0 })).id;
  E = (await makeBook({ price: 5, stock: null })).id;
  // Sifariş 1: A×2 + B×1 = 40 AZN + 5 çatdırılma = 4500 (PENDING)
  await put(A, 2); await put(B, 1); await order();
  // Sifariş 2: B×3 = 60 AZN, pulsuz çatdırılma = 6000 (DELIVERED)
  await put(B, 3); const o2 = await order();
  await status(o2.id, "CONFIRMED"); await status(o2.id, "DELIVERED");
  // Sifariş 3: B×1, ləğv olunur (statistikaya düşməməlidir)
  await put(B, 1); const o3 = await order();
  await status(o3.id, "CANCELLED");
});

describe("Admin statistikası", () => {
  it("yalnız admin: tokensiz 401, adi istifadəçi 403", async () => {
    for (const p of ["overview", "sales", "top-books", "low-stock"]) {
      expect((await api().get(`/admin/stats/${p}`)).status).toBe(401);
      expect((await api().get(`/admin/stats/${p}`).set(bearer(u.token))).status).toBe(403);
    }
  });

  it("overview: dəqiq rəqəmlər (ləğv olunan gəlirə düşmür)", async () => {
    const o = (await g("overview")).body;
    expect(o.orders.total).toBe(3);
    expect(o.orders.byStatus).toMatchObject({ PENDING: 1, CONFIRMED: 0, DELIVERED: 1, CANCELLED: 1 });
    expect(o.revenue).toMatchObject({ grossCents: 10500, deliveredCents: 6000, gross: 105 });
    expect(o.users.total).toBe(2);
    expect(o.books).toMatchObject({ total: 5, outOfStock: 1, lowStock: 1 });
  });

  it("sales: boşluqsuz gün sırası, bu gün 2 sifariş / 10500", async () => {
    const r = (await g("sales?days=7")).body;
    expect(r.series).toHaveLength(7);
    expect(r.series[0].date).toBe(dayPlus(-6));
    expect(r.series.at(-1)).toMatchObject({ date: dayPlus(0), orders: 2, revenueCents: 10500 });
    expect(r.totalRevenueCents).toBe(10500);
    expect((await g("sales")).body.series).toHaveLength(30);
    for (const d of ["0", "366", "abc"]) expect((await g(`sales?days=${d}`)).status, d).toBe(400);
  });

  it("top-books: B 4 ədəd/8000, A 2 ədəd/2000, satılmayan yoxdur", async () => {
    const r = (await g("top-books?limit=50")).body.items;
    expect(r.map((i: any) => i.bookId)).toEqual([B, A]);
    expect(r[0]).toMatchObject({ quantitySold: 4, revenueCents: 8000 });
    expect(r[1]).toMatchObject({ quantitySold: 2, revenueCents: 2000 });
    expect((await g("top-books?limit=1")).body.items).toHaveLength(1);
    expect((await g("top-books?limit=0")).status).toBe(400);
  });

  it("low-stock: D (0) sonra C (2); limitsiz E və bol stoklu kitablar yoxdur", async () => {
    const ids = (await g("low-stock?threshold=5")).body.items.map((i: any) => i.id);
    expect(ids).toEqual([D, C]);
    expect(ids).not.toContain(E);
    expect((await g("low-stock?threshold=0")).body.items.every((i: any) => i.stock === 0)).toBe(true);
    expect((await g("low-stock?threshold=-1")).status).toBe(400);
  });
});