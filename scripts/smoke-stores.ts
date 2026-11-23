// İstifadə (PowerShell, server işləyərkən başqa pəncərədə):
//   $env:ADMIN_EMAIL="admin@bookstore.az"; $env:ADMIN_PASSWORD="AdminParol123"; npx tsx scripts/smoke-stores.ts
// Admin ilə test mağazası və tədbirləri yaradır, açıq endpoint-lərlə yoxlayır, sonda hamısını silir.
// Seed ilə yaranmış real mağazalara toxunmur.
import "dotenv/config";
import bcrypt from "bcryptjs";

process.env.NODE_ENV = "test";
const { prisma } = await import("../src/lib/prisma");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("ADMIN_EMAIL və ADMIN_PASSWORD yaz (faylın başındakı nümunəyə bax).");
  process.exit(1);
}

let passed = 0;
let failed = 0;

type Res = { status: number; body: any };
async function call(method: string, path: string, opts: { token?: string; json?: unknown } = {}): Promise<Res> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.json) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: opts.json ? JSON.stringify(opts.json) : undefined });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body };
}

function check(name: string, ok: boolean, extra = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

function dayPlus(n: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baku" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const stamp = Date.now();
  const admin = (await call("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })).body?.token;
  if (!admin) return console.log("Admin login alınmadı, dayanıram.");

  const userEmail = `st${stamp}@test.az`;
  const user = await prisma.user.create({ data: { email: userEmail, firstName: "St", lastName: "Tester", passwordHash: await bcrypt.hash("12345678", 4) } });
  const userToken = (await call("POST", "/auth/login", { json: { email: userEmail, password: "12345678" } })).body?.token as string;

  const nameA = `[TEST] Mağaza A ${stamp}`;
  const nameB = `[TEST] Mağaza B ${stamp}`;
  const storeBody = (name: string) => ({ name, address: "Test küç. 1, Bakı", lat: 40.4, lng: 49.8, phone: "+994 12 000 00 00", hours: "B.e.–Şən: 09:00–21:00" });
  const ids: number[] = [];

  try {
    console.log("Mağazalar: admin");
    check("adi istifadəçi mağaza yarada bilmir → 403", (await call("POST", "/admin/stores", { token: userToken, json: storeBody(nameA) })).status === 403);
    check("tokensiz → 401", (await call("POST", "/admin/stores", { json: storeBody(nameA) })).status === 401);
    check("lat 100 → 400", (await call("POST", "/admin/stores", { token: admin, json: { ...storeBody(nameA), lat: 100 } })).status === 400);
    check("lng -200 → 400", (await call("POST", "/admin/stores", { token: admin, json: { ...storeBody(nameA), lng: -200 } })).status === 400);
    check("telefon yanlış → 400", (await call("POST", "/admin/stores", { token: admin, json: { ...storeBody(nameA), phone: "abc" } })).status === 400);
    check("artıq sahə (id) → 400", (await call("POST", "/admin/stores", { token: admin, json: { ...storeBody(nameA), id: 5 } })).status === 400);
    let r = await call("POST", "/admin/stores", { token: admin, json: storeBody(nameA) });
    const a = r.body;
    if (a?.id) ids.push(a.id);
    check("mağaza A yaranır: 201", r.status === 201 && a?.name === nameA && a?.lat === 40.4, JSON.stringify(r.body));
    check("eyni ad → 409 STORE_NAME_TAKEN", (await call("POST", "/admin/stores", { token: admin, json: storeBody(nameA) })).body?.error?.code === "STORE_NAME_TAKEN");
    r = await call("POST", "/admin/stores", { token: admin, json: storeBody(nameB) });
    const b = r.body;
    if (b?.id) ids.push(b.id);
    r = await call("PATCH", `/admin/stores/${b.id}`, { token: admin, json: { phone: "+994 18 111 11 11", hours: "Hər gün: 10:00–18:00" } });
    check("mağaza B dəyişdirilir", r.status === 200 && r.body?.phone === "+994 18 111 11 11" && r.body?.name === nameB);
    check("başqa mağazanın adını götürmək → 409", (await call("PATCH", `/admin/stores/${b.id}`, { token: admin, json: { name: nameA } })).status === 409);
    check("boş PATCH → 400", (await call("PATCH", `/admin/stores/${b.id}`, { token: admin, json: {} })).status === 400);
    check("olmayan mağaza PATCH → 404", (await call("PATCH", "/admin/stores/99999999", { token: admin, json: { phone: "+994 12 000 00 00" } })).status === 404);

    console.log("Mağazalar: açıq oxuma");
    r = await call("GET", "/stores");
    check("tokensiz siyahı: 200", r.status === 200 && Array.isArray(r.body?.items));
    check("test mağazaları siyahıdadır, front sahələri ilə", r.body.items.some((s: any) => s.id === a.id && s.address && s.hours && typeof s.lng === "number"));
    check("GET /stores/:id", (await call("GET", `/stores/${a.id}`)).body?.name === nameA);
    check("olmayan mağaza → 404", (await call("GET", "/stores/99999999")).status === 404);
    check("id formatı yanlış → 400", (await call("GET", "/stores/abc")).status === 400);

    console.log("Tədbirlər: admin");
    const ev = (storeId: number, title: string, type: string, locationType: string, date: string, time: string) => ({ storeId, title, type, locationType, date, time });
    check("artıq sahə → 400", (await call("POST", "/admin/events", { token: admin, json: { ...ev(a.id, "T1 tədbiri", "KIDS", "IN_STORE", dayPlus(3), "11:00"), storeName: "x" } })).status === 400);
    check("type yanlış → 400", (await call("POST", "/admin/events", { token: admin, json: ev(a.id, "T1 tədbiri", "PARTY", "IN_STORE", dayPlus(3), "11:00") })).status === 400);
    check("locationType yanlış → 400", (await call("POST", "/admin/events", { token: admin, json: ev(a.id, "T1 tədbiri", "KIDS", "ONLINE", dayPlus(3), "11:00") })).status === 400);
    check("tarix formatı yanlış → 400", (await call("POST", "/admin/events", { token: admin, json: ev(a.id, "T1 tədbiri", "KIDS", "IN_STORE", "03.12.2026", "11:00") })).status === 400);
    check("olmayan tarix (2026-02-30) → 400", (await call("POST", "/admin/events", { token: admin, json: ev(a.id, "T1 tədbiri", "KIDS", "IN_STORE", "2026-02-30", "11:00") })).status === 400);
    check("saat 25:00 → 400", (await call("POST", "/admin/events", { token: admin, json: ev(a.id, "T1 tədbiri", "KIDS", "IN_STORE", dayPlus(3), "25:00") })).status === 400);
    check("olmayan mağazaya tədbir → 404", (await call("POST", "/admin/events", { token: admin, json: ev(99999999, "T1 tədbiri", "KIDS", "IN_STORE", dayPlus(3), "11:00") })).status === 404);
    const evIds: number[] = [];
    const mkEvent = async (...args: Parameters<typeof ev>) => {
      const res = await call("POST", "/admin/events", { token: admin, json: ev(...args) });
      if (res.body?.id) evIds.push(res.body.id);
      return res;
    };
    r = await mkEvent(a.id, "Uşaq nağılı", "KIDS", "IN_STORE", dayPlus(3), "11:00");
    check("tədbir yaranır: 201, storeName avtomatik, date/time string", r.status === 201 && r.body?.storeName === nameA && r.body?.date === dayPlus(3) && r.body?.time === "11:00", JSON.stringify(r.body));
    const e1 = r.body;
    const e2 = (await mkEvent(b.id, "Müəllif imza günü", "AUTHOR", "IN_STORE", dayPlus(3), "09:30")).body;
    const e3 = (await mkEvent(a.id, "Online klub", "OTHER", "VIRTUAL", dayPlus(10), "19:00")).body;
    const e4 = (await mkEvent(b.id, "Virtual müzakirə", "AUTHOR", "VIRTUAL", dayPlus(20), "18:00")).body;

    console.log("Tədbirlər: açıq oxuma və filtrlər");
    const list = async (qs: string) => (await call("GET", `/events?limit=200&${qs}`)).body;
    // Yalnız bu testin mağazalarına baxırıq ki, seed edilmiş real tədbirlər nəticəni pozmasın
    const mine = (body: any) => (body.items as any[]).filter((e) => [a.id, b.id].includes(e.storeId));
    r = await call("GET", "/events?limit=200");
    check("tokensiz siyahı 200", r.status === 200 && Array.isArray(r.body?.items));
    check("tarix və saata görə sıralanıb: 09:30 (B) → 11:00 (A) eyni gündə", JSON.stringify(mine(await list("")).slice(0, 2).map((e) => e.id)) === JSON.stringify([e2.id, e1.id]));
    check("sort=store: mağaza adına görə (A əvvəl)", mine(await list("sort=store"))[0]?.storeId === a.id);
    check("storeId filtri: yalnız A (2 tədbir)", mine(await list(`storeId=${a.id}`)).length === 2 && (await list(`storeId=${a.id}`)).items.every((e: any) => e.storeId === a.id));
    check("type=AUTHOR: yalnız müəllif tədbirləri", mine(await list(`storeId=${b.id}&type=AUTHOR`)).length === 2);
    check("type=KIDS,OTHER (vergüllə bir neçə): 2", mine(await list(`type=KIDS,OTHER`)).length === 2);
    check("locationType=VIRTUAL: 2", mine(await list("locationType=VIRTUAL")).length === 2);
    check("from/to aralığı: yalnız dayPlus(3)", mine(await list(`from=${dayPlus(3)}&to=${dayPlus(3)}`)).length === 2);
    check("from=dayPlus(11): yalnız e4", mine(await list(`from=${dayPlus(11)}`)).map((e) => e.id).join() === String(e4.id));
    check("yanlış type → 400", (await call("GET", "/events?type=PARTY")).status === 400);
    check("from > to → 400", (await call("GET", `/events?from=${dayPlus(5)}&to=${dayPlus(1)}`)).status === 400);
    check("yanlış sort → 400", (await call("GET", "/events?sort=abc")).status === 400);
    check("səhifələmə: limit=1 → 1 element, totalPages ≥ 4", ((r = await call("GET", "/events?limit=1")), r.body?.items?.length === 1 && r.body?.totalPages >= 4));
    check("GET /events/:id", (await call("GET", `/events/${e1.id}`)).body?.title === "Uşaq nağılı");
    check("olmayan tədbir → 404", (await call("GET", "/events/99999999")).status === 404);

    console.log("Tədbirlər: dəyişmək və silmək");
    r = await call("PATCH", `/admin/events/${e1.id}`, { token: admin, json: { time: "12:30", date: dayPlus(4), storeId: b.id } });
    check("tədbir dəyişir və başqa mağazaya keçir, storeName yenilənir", r.status === 200 && r.body?.time === "12:30" && r.body?.date === dayPlus(4) && r.body?.storeName === nameB);
    check("olmayan mağazaya köçürmək → 404", (await call("PATCH", `/admin/events/${e1.id}`, { token: admin, json: { storeId: 99999999 } })).status === 404);
    check("boş PATCH → 400", (await call("PATCH", `/admin/events/${e1.id}`, { token: admin, json: {} })).status === 400);
    check("olmayan tədbir PATCH → 404", (await call("PATCH", "/admin/events/99999999", { token: admin, json: { time: "10:00" } })).status === 404);
    check("adi istifadəçi silə bilmir → 403", (await call("DELETE", `/admin/events/${e3.id}`, { token: userToken })).status === 403);
    check("tədbir silinir → 204", (await call("DELETE", `/admin/events/${e3.id}`, { token: admin })).status === 204);
    check("ikinci dəfə → 404", (await call("DELETE", `/admin/events/${e3.id}`, { token: admin })).status === 404);

    console.log("Mağaza silinəndə");
    check("mağaza B silinir → 204", (await call("DELETE", `/admin/stores/${b.id}`, { token: admin })).status === 204);
    check("onun tədbirləri də silinib (cascade)", (await prisma.storeEvent.count({ where: { storeId: b.id } })) === 0 && (await call("GET", `/events/${e2.id}`)).status === 404);
    check("olmayan mağaza silmək → 404", (await call("DELETE", `/admin/stores/${b.id}`, { token: admin })).status === 404);
  } finally {
    await prisma.store.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }

  console.log(`\nNəticə: ${passed} keçdi, ${failed} kəsildi`);
  await prisma.$disconnect();
  process.exitCode = failed ? 1 : 0;
}

main().catch(async (error) => {
  console.error("Skript xəta ilə dayandı:", error);
  await prisma.$disconnect();
  process.exit(1);
});