import { beforeAll, describe, expect, it } from "vitest";
import { api, bearer, makeAdmin, makeUser, resetDb } from "./helpers";

let admin: Awaited<ReturnType<typeof makeAdmin>>;
let user: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  await resetDb();
  admin = await makeAdmin();
  user = await makeUser();
});

const newBook = (extra: Record<string, unknown> = {}) => ({ title: "Test kitabı", author: "Müəllif", price: 12.5, stock: 3, ...extra });

describe("Kitablar: admin CRUD", () => {
  it("adi istifadəçi kitab yarada bilmir (403), tokensiz 401", async () => {
    expect((await api().post("/admin/books").set(bearer(user.token)).send(newBook())).status).toBe(403);
    expect((await api().post("/admin/books").send(newBook())).status).toBe(401);
  });

  it("admin yaradır: qiymət AZN-dən qəpiyə çevrilir", async () => {
    const res = await api().post("/admin/books").set(bearer(admin.token)).send(newBook());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ priceCents: 1250, price: 12.5, inStock: true });
  });

  it("yanlış məlumat 400: mənfi qiymət, 3 onluq, artıq sahə", async () => {
    for (const bad of [{ price: -1 }, { price: 10.123 }, { price: 0 }, { stock: -2 }, { priceCents: 5 }]) {
      const res = await api().post("/admin/books").set(bearer(admin.token)).send(newBook(bad));
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });

  it("yenilə (PATCH) və boş PATCH 400", async () => {
    const b = (await api().post("/admin/books").set(bearer(admin.token)).send(newBook())).body;
    const ok = await api().patch(`/admin/books/${b.id}`).set(bearer(admin.token)).send({ price: 20, stock: 0 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ priceCents: 2000, inStock: false });
    expect((await api().patch(`/admin/books/${b.id}`).set(bearer(admin.token)).send({})).status).toBe(400);
    expect((await api().patch("/admin/books/99999999").set(bearer(admin.token)).send({ price: 5 })).status).toBe(404);
  });

  it("silmək 204, sonra 404", async () => {
    const b = (await api().post("/admin/books").set(bearer(admin.token)).send(newBook())).body;
    expect((await api().delete(`/admin/books/${b.id}`).set(bearer(admin.token))).status).toBe(204);
    expect((await api().get(`/books/${b.id}`)).status).toBe(404);
  });
});

describe("Kitablar: ictimai siyahı", () => {
  beforeAll(async () => {
    await resetDb();
    admin = await makeAdmin();
    const mk = (title: string, price: number, subjects: string[]) =>
      api().post("/admin/books").set(bearer(admin.token)).send(newBook({ title, price, subjects }));
    await mk("Alma", 5, ["roman"]);
    await mk("Armud", 15, ["elm"]);
    await mk("Heyva", 25, ["roman"]);
  });

  it("tokensiz siyahı açıqdır və səhifələmə var", async () => {
    const res = await api().get("/books?limit=2");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total ?? res.body.pagination?.total).toBe(3);
  });

  it("axtarış, mövzu, qiymət aralığı və sıralama", async () => {
    expect((await api().get("/books?q=armud")).body.items.map((b: any) => b.title)).toEqual(["Armud"]);
    expect((await api().get("/books?subject=roman")).body.items).toHaveLength(2);
    expect((await api().get("/books?minPrice=10&maxPrice=20")).body.items.map((b: any) => b.title)).toEqual(["Armud"]);
    expect((await api().get("/books?sort=price-desc")).body.items[0].title).toBe("Heyva");
    expect((await api().get("/books?sort=title")).body.items[0].title).toBe("Alma");
  });

  it("çoxsözlü axtarış: əvvəl hamısı, tapılmasa hər hansı biri; mövzu teqi də axtarılır; mövzu böyük hərflə də işləyir", async () => {
    expect((await api().get("/books?q=roman")).body.items).toHaveLength(2); // teq: roman
    expect((await api().get("/books?q=alma roman")).body.items.map((b: any) => b.title)).toEqual(["Alma"]); // AND
    expect((await api().get("/books?q=armud heyva")).body.items).toHaveLength(2); // AND tapmadı → OR
    expect((await api().get("/books?q=yoxdurbelekitab")).body.items).toHaveLength(0);
    expect((await api().get("/books?subject=ROMAN")).body.items).toHaveLength(2);
  });

  it("admin mövzuları kiçik hərfə çevrilir", async () => {
    const adm = await makeAdmin();
    const res = await api().post("/admin/books").set(bearer(adm.token)).send(newBook({ subjects: ["  Fantastika "] }));
    expect(res.body.subjects).toEqual(["fantastika"]);
  });

  it("yanlış sorğu parametrləri 400", async () => {
    expect((await api().get("/books?sort=abc")).status).toBe(400);
    expect((await api().get("/books?minPrice=20&maxPrice=10")).status).toBe(400);
    expect((await api().get("/books?limit=1000")).status).toBe(400);
    expect((await api().get("/books/abc")).status).toBe(400);
    expect((await api().get("/books/99999999")).status).toBe(404);
  });
});