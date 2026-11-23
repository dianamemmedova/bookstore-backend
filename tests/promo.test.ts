import { beforeAll, describe, expect, it } from "vitest";
import { api, bearer, makeAdmin, makeUser, prisma, resetDb } from "./helpers";
import { redeemPromo } from "../src/services/promo.service";

let admin: Awaited<ReturnType<typeof makeAdmin>>;
let user: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  await resetDb();
  admin = await makeAdmin();
  user = await makeUser();
});

describe("Promo kodlar", () => {
  it("admin yaradır, kod böyük hərfə çevrilir, təkrar kod 409", async () => {
    const res = await api().post("/admin/promos").set(bearer(admin.token)).send({ code: "yay20", discountPercent: 20 });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe("YAY20");
    expect((await api().post("/admin/promos").set(bearer(admin.token)).send({ code: "YAY20", discountPercent: 10 })).status).toBe(409);
  });

  it("yanlış faiz və adi istifadəçi qadağası", async () => {
    for (const d of [0, 91, 1.5]) {
      expect((await api().post("/admin/promos").set(bearer(admin.token)).send({ code: "BAD" + d, discountPercent: d })).status).toBe(400);
    }
    expect((await api().post("/admin/promos").set(bearer(user.token)).send({ code: "HACK", discountPercent: 90 })).status).toBe(403);
  });

  it("validate: düzgün kod faizi qaytarır, olmayan/söndürülmüş/vaxtı bitmiş kod eyni cür rədd olur", async () => {
    await api().post("/admin/promos").set(bearer(admin.token)).send({ code: "OFF", discountPercent: 10, isActive: false });
    await api().post("/admin/promos").set(bearer(admin.token)).send({ code: "OLD", discountPercent: 10, expiresAt: "2020-01-01T00:00:00Z" });
    const ok = await api().post("/promo/validate").set(bearer(user.token)).send({ code: " yay20 " });
    expect(ok.status).toBe(200);
    expect(ok.body.discountPercent).toBe(20);
    const codes = new Set<string>();
    for (const code of ["YOXDUR", "OFF", "OLD"]) {
      const r = await api().post("/promo/validate").set(bearer(user.token)).send({ code });
      expect(r.status).toBe(400);
      codes.add(r.body.error.code);
    }
    expect(codes).toEqual(new Set(["PROMO_INVALID"]));
  });

  it("eyni istifadəçi eyni kodu paralel 5 dəfə işlətsə yalnız biri keçir", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => prisma.$transaction((tx) => redeemPromo(tx, user.id, "YAY20"))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.promoRedemption.count({ where: { userId: user.id } })).toBe(1);
  });
});