import { beforeAll, describe, expect, it } from "vitest";
import { api, bearer, dayPlus, makeAdmin, makeUser, prisma, resetDb } from "./helpers";

let admin: Awaited<ReturnType<typeof makeAdmin>>;
let user: Awaited<ReturnType<typeof makeUser>>;

const storeBody = (name: string, extra: Record<string, unknown> = {}) => ({
  name, address: "Test küç. 1, Bakı", lat: 40.4, lng: 49.8, phone: "+994 12 000 00 00", hours: "B.e.–Şən: 09:00–21:00", ...extra,
});
const eventBody = (storeId: number, extra: Record<string, unknown> = {}) => ({
  storeId, title: "Uşaq nağılı", type: "KIDS", locationType: "IN_STORE", date: dayPlus(3), time: "11:00", ...extra,
});

beforeAll(async () => {
  await resetDb();
  admin = await makeAdmin();
  user = await makeUser();
});

describe("Mağazalar", () => {
  it("yalnız admin; koordinat/telefon/artıq sahə validasiyası; eyni ad 409", async () => {
    expect((await api().post("/admin/stores").set(bearer(user.token)).send(storeBody("A"))).status).toBe(403);
    expect((await api().post("/admin/stores").send(storeBody("A"))).status).toBe(401);
    for (const bad of [{ lat: 100 }, { lng: -200 }, { phone: "abc" }, { id: 5 }]) {
      expect((await api().post("/admin/stores").set(bearer(admin.token)).send(storeBody("A", bad))).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await api().post("/admin/stores").set(bearer(admin.token)).send(storeBody("Nərimanov"))).status).toBe(201);
    const dup = await api().post("/admin/stores").set(bearer(admin.token)).send(storeBody("Nərimanov"));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("STORE_NAME_TAKEN");
  });

  it("ictimai oxuma, yeniləmə, 404/400", async () => {
    const list = (await api().get("/stores")).body.items;
    const s = list[0];
    expect((await api().get(`/stores/${s.id}`)).body.name).toBe("Nərimanov");
    expect((await api().get("/stores/99999999")).status).toBe(404);
    expect((await api().get("/stores/abc")).status).toBe(400);
    const upd = await api().patch(`/admin/stores/${s.id}`).set(bearer(admin.token)).send({ hours: "Hər gün: 10:00–18:00" });
    expect(upd.body.hours).toBe("Hər gün: 10:00–18:00");
    expect((await api().patch(`/admin/stores/${s.id}`).set(bearer(admin.token)).send({})).status).toBe(400);
  });
});

describe("Tədbirlər", () => {
  let storeA: number;
  let storeB: number;
  beforeAll(async () => {
    storeA = (await api().post("/admin/stores").set(bearer(admin.token)).send(storeBody("A mağaza"))).body.id;
    storeB = (await api().post("/admin/stores").set(bearer(admin.token)).send(storeBody("B mağaza"))).body.id;
  });

  it("validasiya: type, locationType, tarix (2026-02-30), saat 25:00, olmayan mağaza", async () => {
    const post = (body: unknown) => api().post("/admin/events").set(bearer(admin.token)).send(body as object);
    for (const bad of [{ type: "PARTY" }, { locationType: "ONLINE" }, { date: "03.12.2026" }, { date: "2026-02-30" }, { time: "25:00" }, { storeName: "x" }]) {
      expect((await post(eventBody(storeA, bad))).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await post(eventBody(99999999))).status).toBe(404);
  });

  it("yaradılır: storeName avtomatik, date/time mətn; filtr və sıralama", async () => {
    const mk = (storeId: number, extra: Record<string, unknown>) => api().post("/admin/events").set(bearer(admin.token)).send(eventBody(storeId, extra));
    const e1 = await mk(storeA, { time: "11:00" });
    expect(e1.status).toBe(201);
    expect(e1.body).toMatchObject({ storeName: "A mağaza", date: dayPlus(3), time: "11:00" });
    const e2 = await mk(storeB, { time: "09:30", type: "AUTHOR", locationType: "VIRTUAL" });
    await mk(storeB, { date: dayPlus(10), type: "OTHER" });

    const list = async (qs = "") => (await api().get(`/events?limit=100&${qs}`)).body.items as any[];
    expect((await list()).slice(0, 2).map((e) => e.id)).toEqual([e2.body.id, e1.body.id]); // eyni gündə 09:30 → 11:00
    expect(await list(`storeId=${storeA}`)).toHaveLength(1);
    expect(await list("type=AUTHOR")).toHaveLength(1);
    expect(await list("type=KIDS,OTHER")).toHaveLength(2);
    expect(await list("locationType=VIRTUAL")).toHaveLength(1);
    expect(await list(`from=${dayPlus(3)}&to=${dayPlus(3)}`)).toHaveLength(2);
    expect((await list("sort=store"))[0].storeName).toBe("A mağaza");
    for (const qs of ["type=PARTY", `from=${dayPlus(5)}&to=${dayPlus(1)}`, "sort=abc"]) {
      expect((await api().get(`/events?${qs}`)).status, qs).toBe(400);
    }
  });

  it("mağaza silinəndə tədbirləri də silinir (cascade)", async () => {
    expect((await api().delete(`/admin/stores/${storeB}`).set(bearer(admin.token))).status).toBe(204);
    expect(await prisma.storeEvent.count({ where: { storeId: storeB } })).toBe(0);
  });
});