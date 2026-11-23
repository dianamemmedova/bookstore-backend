import { beforeAll, describe, expect, it } from "vitest";
import { api, bearer, makeAdmin, makeBook, makeUser, prisma, resetDb } from "./helpers";

const text = "Bu kitab haqqında kifayət qədər uzun rəy mətni.";
let admin: Awaited<ReturnType<typeof makeAdmin>>;
let a: Awaited<ReturnType<typeof makeUser>>;
let b: Awaited<ReturnType<typeof makeUser>>;
let c: Awaited<ReturnType<typeof makeUser>>;
let book: Awaited<ReturnType<typeof makeBook>>;

const write = (token: string, json: Record<string, unknown>, bookId = book.id) =>
  api().post(`/books/${bookId}/reviews`).set(bearer(token)).send({ rating: 5, title: "Əla kitab", body: text, ...json });

beforeAll(async () => {
  await resetDb();
  admin = await makeAdmin();
  a = await makeUser({ firstName: "Əli", lastName: "Məmmədov" });
  b = await makeUser();
  c = await makeUser();
  book = await makeBook();
});

describe("Rəylər", () => {
  it("yazmaq üçün token lazımdır; oxumaq açıqdır; olmayan kitab 404", async () => {
    expect((await api().post(`/books/${book.id}/reviews`).send({ rating: 5, title: "Əla kitab", body: text })).status).toBe(401);
    expect((await api().get(`/books/${book.id}/reviews`)).status).toBe(200);
    expect((await api().get("/books/99999999/reviews")).status).toBe(404);
  });

  it("validasiya: rating 0/6/4.5, qısa başlıq/mətn, artıq sahə (helpfulYes, userId)", async () => {
    for (const bad of [{ rating: 0 }, { rating: 6 }, { rating: 4.5 }, { title: "Ok" }, { body: "qısa" }, { helpfulYes: 99 }, { userId: 1 }]) {
      expect((await write(a.token, bad)).status, JSON.stringify(bad)).toBe(400);
    }
  });

  it("yaradılır: ad 'Əli M.' formasında, recommended rating-dən çıxır, tam soyad sızmır", async () => {
    const res = await write(a.token, { rating: 5 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ user: "Əli M.", recommended: true, isMine: true, myVote: null, helpful: { yes: 0, no: 0 } });
    expect(JSON.stringify(res.body)).not.toContain("Məmmədov");
    const low = await write(b.token, { rating: 2 });
    expect(low.body.recommended).toBe(false);
  });

  it("eyni kitaba ikinci rəy 409, paralel 5 sorğudan yalnız biri keçir", async () => {
    const second = await write(a.token, { rating: 3 });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("REVIEW_ALREADY_EXISTS");
    const other = await makeBook();
    const results = await Promise.all(Array.from({ length: 5 }, () => write(c.token, {}, other.id)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
  });

  it("xülasə bütün rəylərdən hesablanır (filtrdən asılı olmayaraq)", async () => {
    const all = (await api().get(`/books/${book.id}/reviews`)).body;
    expect(all.summary).toMatchObject({ totalReviews: 2, avgRating: 3.5, recommendedPercent: 50 });
    const filtered = (await api().get(`/books/${book.id}/reviews?rating=5`)).body;
    expect(filtered.total).toBe(1);
    expect(filtered.summary.totalReviews).toBe(2);
    expect((await api().get(`/books/${book.id}/reviews?sort=abc`)).status).toBe(400);
    expect((await api().get(`/books/${book.id}/reviews?rating=9`)).status).toBe(400);
  });

  it("səs vermək: yes/no, dəyişmək, geri götürmək; sayğaclar düzgündür", async () => {
    const id = (await api().get(`/books/${book.id}/reviews?sort=highest`)).body.items[0].id;
    const vote = (token: string, helpful: string) => api().put(`/reviews/${id}/vote`).set(bearer(token)).send({ helpful });
    expect((await api().put(`/reviews/${id}/vote`).send({ helpful: "yes" })).status).toBe(401);
    expect((await vote(b.token, "yes")).body.helpful).toEqual({ yes: 1, no: 0 });
    expect((await vote(c.token, "no")).body.helpful).toEqual({ yes: 1, no: 1 });
    expect((await vote(c.token, "yes")).body).toMatchObject({ helpful: { yes: 2, no: 0 }, myVote: "yes" });
    expect((await vote(b.token, "maybe")).status).toBe(400);
    const removed = await api().delete(`/reviews/${id}/vote`).set(bearer(b.token));
    expect(removed.body.helpful).toEqual({ yes: 1, no: 0 });
  });

  it("paralel 10 səs: sayğac həmişə bazadakı səslərlə üst-üstə düşür", async () => {
    const id = (await api().get(`/books/${book.id}/reviews`)).body.items[0].id;
    const voters = await Promise.all(Array.from({ length: 10 }, () => makeUser()));
    await Promise.all(voters.map((v, i) => api().put(`/reviews/${id}/vote`).set(bearer(v.token)).send({ helpful: i % 2 ? "yes" : "no" })));
    const row = await prisma.review.findUniqueOrThrow({ where: { id } });
    const yes = await prisma.reviewVote.count({ where: { reviewId: id, helpful: true } });
    const no = await prisma.reviewVote.count({ where: { reviewId: id, helpful: false } });
    expect({ yes: row.helpfulYes, no: row.helpfulNo }).toEqual({ yes, no });
  });

  it("redaktə/silmək: yalnız sahibi (başqası 404), admin istənilən rəyi silə bilər", async () => {
    const mine = (await write(b.token, {}, (await makeBook()).id)).body;
    expect((await api().patch(`/reviews/${mine.id}`).set(bearer(a.token)).send({ rating: 1 })).status).toBe(404);
    expect((await api().delete(`/reviews/${mine.id}`).set(bearer(a.token))).status).toBe(404);
    expect((await api().patch(`/reviews/${mine.id}`).set(bearer(b.token)).send({})).status).toBe(400);
    expect((await api().patch(`/reviews/${mine.id}`).set(bearer(b.token)).send({ helpfulYes: 100 })).status).toBe(400);
    const upd = await api().patch(`/reviews/${mine.id}`).set(bearer(b.token)).send({ rating: 4, title: "Yenilənmiş başlıq" });
    expect(upd.body).toMatchObject({ rating: 4, title: "Yenilənmiş başlıq" });
    expect((await api().delete(`/reviews/${mine.id}`).set(bearer(admin.token))).status).toBe(204);
  });

  it("kitab silinəndə rəyləri də silinir (cascade)", async () => {
    const tmp = await makeBook();
    await write(a.token, {}, tmp.id);
    await api().delete(`/admin/books/${tmp.id}`).set(bearer(admin.token));
    expect(await prisma.review.count({ where: { bookId: tmp.id } })).toBe(0);
  });
});