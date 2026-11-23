// İstifadə (PowerShell, server işləyərkən başqa pəncərədə):
//   $env:ADMIN_EMAIL="admin@bookstore.az"; $env:ADMIN_PASSWORD="AdminParol123"; npx tsx scripts/smoke-stats.ts
// Statistika bütün bazanı göstərir, ona görə skript əvvəl "əvvəlki" rəqəmləri oxuyur, sonra öz test məlumatını
// (kitab, istifadəçi, sifarişlər) yaradır və FƏRQİN düzgün olduğunu yoxlayır. Sonda hamısını silir.
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

const delivery = () => ({ payMethod: "CASH", fullName: "Stat Tester", phone: "+994501234567", city: "Bakı", street: "Test küç.", deliveryDate: dayPlus(6) });

async function main() {
  const stamp = Date.now();
  const admin = (await call("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })).body?.token;
  if (!admin) return console.log("Admin login alınmadı, dayanıram.");

  const userEmail = `stat${stamp}@test.az`;
  const passwordHash = await bcrypt.hash("12345678", 4);
  const g = (path: string) => call("GET", path, { token: admin });

  console.log("Giriş tələbi");
  const plain = await prisma.user.create({ data: { email: `statplain${stamp}@test.az`, firstName: "P", lastName: "T", passwordHash } });
  const plainToken = (await call("POST", "/auth/login", { json: { email: `statplain${stamp}@test.az`, password: "12345678" } })).body?.token as string;
  for (const path of ["overview", "sales", "top-books", "low-stock"]) {
    check(`tokensiz /admin/stats/${path} → 401`, (await call("GET", `/admin/stats/${path}`)).status === 401);
    check(`adi istifadəçi /admin/stats/${path} → 403`, (await call("GET", `/admin/stats/${path}`, { token: plainToken })).status === 403);
  }

  const before = (await g("/admin/stats/overview")).body;
  const salesBefore = (await g("/admin/stats/sales?days=7")).body;
  const todayBefore = salesBefore?.series?.at(-1);
  check("overview strukturu: orders/revenue/users/books/reviews/inbox", !!before?.orders?.byStatus && !!before?.revenue && !!before?.users && !!before?.books && !!before?.reviews && !!before?.inbox, JSON.stringify(before));

  // Test məlumatı
  const mk = async (title: string, price: number, stock: number | null) =>
    (await call("POST", "/admin/books", { token: admin, json: { title: `[TEST] ${title} ${stamp}`, author: "Test", price, stock } })).body.id as number;
  const A = await mk("A", 10, 10);
  const B = await mk("B", 20, 10);
  const C = await mk("C", 5, 2); // az qalıb
  const D = await mk("D", 5, 0); // qurtarıb
  const E = await mk("E", 5, null); // limitsiz
  const user = await prisma.user.create({ data: { email: userEmail, firstName: "Stat", lastName: "User", passwordHash } });
  const token = (await call("POST", "/auth/login", { json: { email: userEmail, password: "12345678" } })).body?.token as string;
  const put = (id: number, quantity: number) => call("PUT", `/cart/items/${id}`, { token, json: { quantity } });
  const order = async () => (await call("POST", "/orders", { token, json: delivery() })).body;

  try {
    // Sifariş 1: A×2 + B×1 = 40 AZN, çatdırılma 5 → 4500 (PENDING qalır)
    await put(A, 2);
    await put(B, 1);
    const o1 = await order();
    // Sifariş 2: B×3 = 60 AZN, çatdırılma 0 → 6000 (DELIVERED)
    await put(B, 3);
    const o2 = await order();
    await call("PATCH", `/admin/orders/${o2.id}/status`, { token: admin, json: { status: "CONFIRMED" } });
    await call("PATCH", `/admin/orders/${o2.id}/status`, { token: admin, json: { status: "DELIVERED" } });
    // Sifariş 3: B×1, sonra ləğv (statistikaya düşməməlidir)
    await put(B, 1);
    const o3 = await order();
    await call("PATCH", `/admin/orders/${o3.id}/status`, { token: admin, json: { status: "CANCELLED" } });
    check("3 test sifarişi yarandı", !!o1?.id && !!o2?.id && !!o3?.id, JSON.stringify([o1, o2, o3].map((o) => o?.error ?? o?.id)));

    console.log("Overview (fərqlər)");
    const after = (await g("/admin/stats/overview")).body;
    check("sifarişlərin sayı +3", after.orders.total - before.orders.total === 3);
    check("PENDING +1, DELIVERED +1, CANCELLED +1, CONFIRMED +0", after.orders.byStatus.PENDING - before.orders.byStatus.PENDING === 1 && after.orders.byStatus.DELIVERED - before.orders.byStatus.DELIVERED === 1 && after.orders.byStatus.CANCELLED - before.orders.byStatus.CANCELLED === 1 && after.orders.byStatus.CONFIRMED === before.orders.byStatus.CONFIRMED);
    check("gəlir +10500 qəpik (4500 + 6000, ləğv olunan sayılmır)", after.revenue.grossCents - before.revenue.grossCents === 10500, `${after.revenue.grossCents - before.revenue.grossCents}`);
    check("çatdırılmış gəlir +6000", after.revenue.deliveredCents - before.revenue.deliveredCents === 6000);
    check("AZN sahəsi qəpiklə uyğundur", after.revenue.gross === after.revenue.grossCents / 100);
    check("yeni istifadəçi +1 (ümumi və son 30 gündə)", after.users.total - before.users.total === 1 && after.users.newLast30Days - before.users.newLast30Days === 1);
    check("kitablar +5", after.books.total - before.books.total === 5);
    check("qurtarmış +1 (D), az qalan +1 (C), limitsiz E sayılmır", after.books.outOfStock - before.books.outOfStock === 1 && after.books.lowStock - before.books.lowStock === 1);

    console.log("Gündəlik satış");
    let r = await g("/admin/stats/sales?days=7");
    const today = r.body?.series?.at(-1);
    check("7 gün, 7 element, tarixlər ardıcıl və sonuncu bu gündür", r.body?.series?.length === 7 && r.body.series[0].date === dayPlus(-6) && today?.date === dayPlus(0));
    check("bu gün: sifariş +2, gəlir +10500", today?.orders - todayBefore?.orders === 2 && today?.revenueCents - todayBefore?.revenueCents === 10500);
    check("satışsız günlər 0 ilə gəlir (boşluq yoxdur)", r.body.series.every((d: any) => typeof d.orders === "number" && typeof d.revenueCents === "number"));
    check("totalRevenueCents sətirlərin cəminə bərabərdir", r.body.totalRevenueCents === r.body.series.reduce((s: number, d: any) => s + d.revenueCents, 0));
    check("days=1: yalnız bu gün", (await g("/admin/stats/sales?days=1")).body?.series?.length === 1);
    check("days verilməsə 30 gün", (await g("/admin/stats/sales")).body?.series?.length === 30);
    check("days=0 → 400", (await g("/admin/stats/sales?days=0")).status === 400);
    check("days=366 → 400", (await g("/admin/stats/sales?days=366")).status === 400);
    check("days=abc → 400", (await g("/admin/stats/sales?days=abc")).status === 400);

    console.log("Ən çox satılanlar");
    r = await g("/admin/stats/top-books?limit=50");
    const topA = r.body?.items?.find((i: any) => i.bookId === A);
    const topB = r.body?.items?.find((i: any) => i.bookId === B);
    check("A: 2 ədəd, 2000 qəpik", topA?.quantitySold === 2 && topA?.revenueCents === 2000, JSON.stringify(topA));
    check("B: 1+3 = 4 ədəd (ləğv olunan 1 sayılmır), 8000 qəpik", topB?.quantitySold === 4 && topB?.revenueCents === 8000, JSON.stringify(topB));
    check("sıralama: B (4) A-dan (2) əvvəl", r.body.items.findIndex((i: any) => i.bookId === B) < r.body.items.findIndex((i: any) => i.bookId === A));
    check("satılmayan kitab (C) siyahıda yoxdur", !r.body.items.some((i: any) => i.bookId === C));
    check("limit=1 → 1 element", (await g("/admin/stats/top-books?limit=1")).body?.items?.length === 1);
    check("days=1 filtri bugünkü satışları göstərir", (await g("/admin/stats/top-books?days=1&limit=50")).body?.items?.some((i: any) => i.bookId === B));
    check("limit=0 → 400", (await g("/admin/stats/top-books?limit=0")).status === 400);

    console.log("Stoku azalanlar");
    r = await g("/admin/stats/low-stock?threshold=5&limit=100");
    const ids = r.body?.items?.map((i: any) => i.id);
    check("C (stok 2) və D (stok 0) siyahıdadır", ids?.includes(C) && ids?.includes(D));
    check("limitsiz E və bol stoklu A/B siyahıda yoxdur ", !ids?.includes(E) && !ids?.includes(A) && !ids?.includes(B));
    check("ən az stok birinci (D=0 → C=2)", ids?.indexOf(D) < ids?.indexOf(C));
    check("threshold=0: yalnız qurtarmışlar", (await g("/admin/stats/low-stock?threshold=0&limit=100")).body?.items?.every((i: any) => i.stock === 0));
    check("threshold=-1 → 400", (await g("/admin/stats/low-stock?threshold=-1")).status === 400);
  } finally {
    await prisma.order.deleteMany({ where: { userId: user.id } });
    await prisma.book.deleteMany({ where: { id: { in: [A, B, C, D, E] } } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, plain.id] } } });
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