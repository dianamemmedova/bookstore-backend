import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, bearer, makeAdmin, makeUser, prisma, resetDb } from "./helpers";

beforeAll(resetDb);
afterAll(() => prisma.$disconnect());

const valid = { firstName: "Diana", lastName: "Məmmədova", email: "diana@test.az", password: "Parol12345" };

describe("qeydiyyat", () => {
  it("yeni istifadəçi yaradır, token qaytarır, parol qaytarmır", async () => {
    const res = await api().post("/auth/register").send(valid);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user).toMatchObject({ email: "diana@test.az", role: "USER" });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|Parol12345/);
  });

  it("parol bazada hash kimi saxlanır", async () => {
    const row = await prisma.user.findUniqueOrThrow({ where: { email: "diana@test.az" } });
    expect(row.passwordHash).not.toBe("Parol12345");
    expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("eyni email ikinci dəfə: 409 EMAIL_TAKEN (böyük-kiçik hərfdən asılı olmayaraq)", async () => {
    const res = await api().post("/auth/register").send({ ...valid, email: "DIANA@test.az" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("role göndərmək mümkün deyil: istifadəçi həmişə USER yaranır", async () => {
    const res = await api().post("/auth/register").send({ ...valid, email: "x@test.az", role: "ADMIN" });
    // schema artıq sahəni atır və ya rədd edir, hər halda ADMIN olmamalıdır
    if (res.status === 201) expect(res.body.user.role).toBe("USER");
    else expect(res.status).toBe(400);
  });

  it.each([
    ["qısa parol", { password: "short" }],
    ["yanlış email", { email: "abc" }],
    ["ad rəqəmlərlə", { firstName: "123" }],
    ["ad yoxdur", { firstName: undefined }],
  ])("yoxlama: %s → 400", async (_name, patch) => {
    const res = await api().post("/auth/register").send({ ...valid, email: "v@test.az", ...patch });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("giriş", () => {
  it("düzgün məlumatla token verir", async () => {
    const res = await api().post("/auth/login").send({ email: "diana@test.az", password: "Parol12345" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
  });

  it("səhv parol və olmayan email EYNİ cavabı verir (hesabın varlığı sızmır)", async () => {
    const wrongPass = await api().post("/auth/login").send({ email: "diana@test.az", password: "yanlis-parol" });
    const noUser = await api().post("/auth/login").send({ email: "yoxdur@test.az", password: "yanlis-parol" });
    expect(wrongPass.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPass.body.error.code).toBe(noUser.body.error.code);
    expect(wrongPass.body.error.message).toBe(noUser.body.error.message);
  });
});

describe("token və /me", () => {
  it("tokensiz 401", async () => {
    expect((await api().get("/me")).status).toBe(401);
  });

  it("saxta və dəyişdirilmiş token 401", async () => {
    const user = await makeUser();
    expect((await api().get("/me").set(bearer("yalan.token.burada"))).status).toBe(401);
    expect((await api().get("/me").set(bearer(user.token.slice(0, -3) + "abc"))).status).toBe(401);
  });

  it("öz profilini görür", async () => {
    const user = await makeUser({ email: "me@test.az" });
    const res = await api().get("/me").set(bearer(user.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: "me@test.az", role: "USER" });
  });

  it("profili dəyişir, amma email və role dəyişmir (strict)", async () => {
    const user = await makeUser();
    const ok = await api().patch("/me").set(bearer(user.token)).send({ firstName: "Yeni", marketingOptIn: true });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ firstName: "Yeni", marketingOptIn: true });
    expect((await api().patch("/me").set(bearer(user.token)).send({ role: "ADMIN" })).status).toBe(400);
    expect((await api().patch("/me").set(bearer(user.token)).send({ email: "x@y.az" })).status).toBe(400);
    expect((await api().patch("/me").set(bearer(user.token)).send({})).status).toBe(400);
  });
});

describe("parolu dəyişmək", () => {
  it("cari parol səhvdirsə 400 WRONG_PASSWORD", async () => {
    const user = await makeUser();
    const res = await api().put("/me/password").set(bearer(user.token)).send({ currentPassword: "yanlis", newPassword: "YeniParol123" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("WRONG_PASSWORD");
  });

  it("yeni parol cariyə bərabər ola bilməz", async () => {
    const user = await makeUser();
    const res = await api().put("/me/password").set(bearer(user.token)).send({ currentPassword: user.password, newPassword: user.password });
    expect(res.status).toBe(400);
  });

  it("dəyişəndən sonra köhnə parol işləmir, yenisi işləyir", async () => {
    const user = await makeUser();
    const res = await api().put("/me/password").set(bearer(user.token)).send({ currentPassword: user.password, newPassword: "YeniParol123" });
    expect(res.status).toBe(204);
    expect((await api().post("/auth/login").send({ email: user.email, password: user.password })).status).toBe(401);
    expect((await api().post("/auth/login").send({ email: user.email, password: "YeniParol123" })).status).toBe(200);
  });
});

describe("rollar", () => {
  it("adi istifadəçi admin endpointinə 403, tokensiz 401, admin 200", async () => {
    const user = await makeUser();
    const admin = await makeAdmin();
    expect((await api().get("/admin/users")).status).toBe(401);
    expect((await api().get("/admin/users").set(bearer(user.token))).status).toBe(403);
    const ok = await api().get("/admin/users").set(bearer(admin.token));
    expect(ok.status).toBe(200);
    expect(ok.body.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(ok.body)).not.toMatch(/passwordHash/);
  });
});

describe("brute-force qoruması", () => {
  it("uğursuz girişlər limiti aşanda 429 gəlir (limit 5, bu fayldakı əvvəlki uğursuz cəhdlər də sayılır)", async () => {
    const results: number[] = [];
    for (let i = 0; i < 7; i++) {
      results.push((await api().post("/auth/login").send({ email: "kimse@test.az", password: "yanlis" + i })).status);
    }
    const firstBlocked = results.indexOf(429);
    expect(firstBlocked).toBeGreaterThan(0);
    expect(results.slice(0, firstBlocked).every((s) => s === 401)).toBe(true);
    expect(results.slice(firstBlocked).every((s) => s === 429)).toBe(true);
    // bloklanandan sonra DÜZGÜN parol da keçmir (hücumçu təxmin etməyə davam edə bilməz)
    expect((await api().post("/auth/login").send({ email: "diana@test.az", password: "Parol12345" })).status).toBe(429);
  });
});