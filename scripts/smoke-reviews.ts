// İstifadə (PowerShell, server işləyərkən başqa pəncərədə):
//   $env:ADMIN_EMAIL="admin@bookstore.az"; $env:ADMIN_PASSWORD="AdminParol123"; npx tsx scripts/smoke-reviews.ts
// Admin test kitabı yaradır, 4 test istifadəçi ilə rəy və "faydalı oldu" səslərini yoxlayır, sonda hamısını silir.
import "dotenv/config";
import bcrypt from "bcryptjs";

// Prisma-nın hər SQL sorğusunu çap etməsini söndürürük (config-dən əvvəl təyin olunmalıdır)
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

const text10 = "Bu kitab haqqında kifayət qədər uzun rəy mətni.";

async function main() {
  const stamp = Date.now();
  const login = await call("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const admin = login.body?.token;
  if (!admin) return console.log("Admin login alınmadı, dayanıram.");

  // İstifadəçiləri birbaşa bazada yaradırıq (qeydiyyat limiti maneə olmasın), sonra API ilə giriş edirik
  const passwordHash = await bcrypt.hash("12345678", 4);
  const mkUser = async (n: string) => {
    const email = `rev${n}${stamp}@test.az`;
    await prisma.user.create({ data: { email, firstName: "Əli", lastName: "Məmmədov", passwordHash } });
    return (await call("POST", "/auth/login", { json: { email, password: "12345678" } })).body?.token as string;
  };
  const [u1, u2, u3, u4] = [await mkUser("1"), await mkUser("2"), await mkUser("3"), await mkUser("4")];

  const book = (await call("POST", "/admin/books", { token: admin, json: { title: `[TEST] Rəy kitabı ${stamp}`, author: "Test", price: 10, stock: 5 } })).body?.id as number;
  const book2 = (await call("POST", "/admin/books", { token: admin, json: { title: `[TEST] Rəy kitabı 2 ${stamp}`, author: "Test", price: 10, stock: 5 } })).body?.id as number;
  if (!book || !book2) return console.log("Test kitabları yaranmadı, dayanıram.");

  const rv = (token: string, json: unknown, id = book) => call("POST", `/books/${id}/reviews`, { token, json });
  const vote = (token: string, id: number, helpful: string) => call("PUT", `/reviews/${id}/vote`, { token, json: { helpful } });

  try {
    console.log("Boş vəziyyət");
    let r = await call("GET", `/books/${book}/reviews`);
    check("rəysiz kitab: 200, total 0, avg 0, 5 sətirlik ratingCounts", r.status === 200 && r.body?.summary?.totalReviews === 0 && r.body?.summary?.avgRating === 0 && r.body?.summary?.ratingCounts?.length === 5 && r.body?.items?.length === 0, JSON.stringify(r.body));
    check("olmayan kitab → 404", (await call("GET", "/books/99999999/reviews")).status === 404);
    check("kitab id formatı yanlış → 400", (await call("GET", "/books/abc/reviews")).status === 400);

    console.log("Yazmaq: giriş və yoxlamalar");
    check("tokensiz POST 401", (await call("POST", `/books/${book}/reviews`, { json: { rating: 5, title: "Əla kitab", body: text10 } })).status === 401);
    check("rating 0 → 400", (await rv(u1, { rating: 0, title: "Əla kitab", body: text10 })).status === 400);
    check("rating 6 → 400", (await rv(u1, { rating: 6, title: "Əla kitab", body: text10 })).status === 400);
    check("rating 4.5 → 400", (await rv(u1, { rating: 4.5, title: "Əla kitab", body: text10 })).status === 400);
    check("qısa başlıq → 400", (await rv(u1, { rating: 5, title: "Ok", body: text10 })).status === 400);
    check("qısa rəy mətni → 400", (await rv(u1, { rating: 5, title: "Əla kitab", body: "qısa" })).status === 400);
    check("artıq sahə (userId) → 400", (await rv(u1, { rating: 5, title: "Əla kitab", body: text10, userId: 1 })).status === 400);
    check("helpful sayğacını özü təyin etmək (helpfulYes) → 400", (await rv(u1, { rating: 5, title: "Əla kitab", body: text10, helpfulYes: 99 })).status === 400);
    check("olmayan kitaba rəy → 404", (await rv(u1, { rating: 5, title: "Əla kitab", body: text10 }, 99999999)).status === 404);

    console.log("Yazmaq");
    r = await rv(u1, { rating: 5, title: "Möhtəşəm əsər", body: text10 });
    const r1 = r.body;
    check("201", r.status === 201, JSON.stringify(r.body));
    check("recommended göndərilməyib: rating 5 → true", r1?.recommended === true);
    check('istifadəçi adı "Əli M." formasında (tam soyad yox)', r1?.user === "Əli M.");
    check("isMine true, helpful 0/0, myVote null", r1?.isMine === true && r1?.helpful?.yes === 0 && r1?.helpful?.no === 0 && r1?.myVote === null);
    r = await rv(u1, { rating: 3, title: "İkinci rəy", body: text10 });
    check("eyni kitaba ikinci rəy → 409 REVIEW_ALREADY_EXISTS", r.status === 409 && r.body?.error?.code === "REVIEW_ALREADY_EXISTS");
    check("başqa kitaba yazmaq olar", (await rv(u1, { rating: 3, title: "Başqa kitab", body: text10 }, book2)).status === 201);
    const parallel = await Promise.all(Array.from({ length: 5 }, () => rv(u2, { rating: 4, title: "Paralel rəy", body: text10 })));
    check("5 paralel sorğu: yalnız biri 201, qalanı 409", parallel.filter((p) => p.status === 201).length === 1 && parallel.filter((p) => p.status === 409).length === 4);
    const r2 = parallel.find((p) => p.status === 201)!.body;
    const r3 = (await rv(u3, { rating: 2, title: "Zəif kitab", body: text10 })).body;
    const r4 = (await rv(u4, { rating: 1, title: "Çox pis", body: text10, recommended: true })).body;
    check("rating 2 → recommended default false", r3?.recommended === false);
    check("recommended açıq göndərilib (rating 1, true) → true", r4?.recommended === true);

    console.log("Siyahı və xülasə");
    r = await call("GET", `/books/${book}/reviews`);
    const s = r.body?.summary;
    check("qonaq oxuya bilir, 4 rəy", r.status === 200 && r.body?.items?.length === 4 && s?.totalReviews === 4);
    check("avgRating (5+4+2+1)/4 = 3", s?.avgRating === 3);
    check("recommendedPercent 75 (3/4)", s?.recommendedPercent === 75);
    check("ratingCounts: 5★1, 4★1, 3★0, 2★1, 1★1", JSON.stringify(s?.ratingCounts) === JSON.stringify([{ star: 5, count: 1 }, { star: 4, count: 1 }, { star: 3, count: 0 }, { star: 2, count: 1 }, { star: 1, count: 1 }]));
    check("qonaqda myVote null, isMine false", r.body?.items?.every((i: any) => i.myVote === null && i.isMine === false));
    check("cavabda email/userId sızmır", !JSON.stringify(r.body).includes("@test.az") && r.body.items.every((i: any) => !("userId" in i)));
    r = await call("GET", `/books/${book}/reviews?sort=newest`, { token: u1 });
    check("sort=newest: ən yeni birinci (u4), u1-də öz rəyi isMine", r.body?.items?.[0]?.id === r4.id && r.body?.items?.find((i: any) => i.id === r1.id)?.isMine === true);
    check("sort=highest: 5★ birinci", (await call("GET", `/books/${book}/reviews?sort=highest`)).body?.items?.[0]?.rating === 5);
    check("sort=lowest: 1★ birinci", (await call("GET", `/books/${book}/reviews?sort=lowest`)).body?.items?.[0]?.rating === 1);
    r = await call("GET", `/books/${book}/reviews?rating=4`);
    check("rating=4 filtri: 1 rəy, amma xülasə hələ 4 rəyin hamısından", r.body?.items?.length === 1 && r.body?.items?.[0]?.rating === 4 && r.body?.summary?.totalReviews === 4 && r.body?.total === 1);
    r = await call("GET", `/books/${book}/reviews?limit=3&page=2`);
    check("səhifələmə: limit 3, 2-ci səhifədə 1 rəy, totalPages 2", r.body?.items?.length === 1 && r.body?.totalPages === 2 && r.body?.total === 4);
    check("yanlış sort → 400", (await call("GET", `/books/${book}/reviews?sort=abc`)).status === 400);
    check("rating=9 → 400", (await call("GET", `/books/${book}/reviews?rating=9`)).status === 400);

    console.log('"Faydalı oldu?" səsləri');
    check("tokensiz səs 401", (await call("PUT", `/reviews/${r1.id}/vote`, { json: { helpful: "yes" } })).status === 401);
    r = await vote(u1, r1.id, "yes");
    check("öz rəyinə səs → 403", r.status === 403);
    check('helpful "maybe" → 400', (await vote(u2, r1.id, "maybe")).status === 400);
    check("olmayan rəyə səs → 404", (await vote(u2, 99999999, "yes")).status === 404);
    r = await vote(u2, r1.id, "yes");
    check("u2 yes: 200, yes 1, myVote yes", r.status === 200 && r.body?.helpful?.yes === 1 && r.body?.myVote === "yes");
    r = await vote(u3, r1.id, "yes");
    check("u3 yes: yes 2", r.body?.helpful?.yes === 2);
    r = await vote(u4, r1.id, "yes");
    check("u4 yes: yes 3", r.body?.helpful?.yes === 3);
    r = await vote(u2, r1.id, "yes");
    check("eyni səsi təkrar etmək sayı artırmır (yes hələ 3)", r.status === 200 && r.body?.helpful?.yes === 3);
    r = await vote(u4, r1.id, "no");
    check("u4 səsini dəyişir: yes 2, no 1", r.body?.helpful?.yes === 2 && r.body?.helpful?.no === 1 && r.body?.myVote === "no");
    r = await call("DELETE", `/reviews/${r1.id}/vote`, { token: u3 });
    check("u3 səsini geri götürür: yes 1, myVote null", r.status === 200 && r.body?.helpful?.yes === 1 && r.body?.myVote === null);
    r = await call("GET", `/books/${book}/reviews`, { token: u2 });
    check("siyahıda u2-nin öz səsi görünür (myVote yes)", r.body?.items?.find((i: any) => i.id === r1.id)?.myVote === "yes");
    await vote(u3, r1.id, "yes"); // r1: yes 2
    await vote(u1, r2.id, "yes"); // r2: yes 1
    r = await call("GET", `/books/${book}/reviews?sort=featured`);
    check("sort=featured: ən çox 'faydalı' olan birinci", r.body?.items?.[0]?.id === r1.id && r.body?.items?.[1]?.id === r2.id);
    const pv = await Promise.all([u1, u2, u4].map((t) => vote(t, r3.id, "yes")));
    check("3 nəfər paralel səs verir: hamısı 200", pv.every((x) => x.status === 200));
    check("sayğac dəqiq: yes 3", (await prisma.review.findUniqueOrThrow({ where: { id: r3.id } })).helpfulYes === 3);
    await Promise.all(Array.from({ length: 6 }, () => vote(u2, r4.id, "no")));
    const afterSame = await prisma.review.findUniqueOrThrow({ where: { id: r4.id } });
    check("eyni nəfər 6 paralel səs: sayğac 1, bazada 1 sətir", afterSame.helpfulNo === 1 && (await prisma.reviewVote.count({ where: { reviewId: r4.id } })) === 1);

    console.log("Dəyişmək");
    r = await call("PATCH", `/reviews/${r1.id}`, { token: u1, json: { rating: 4, title: "Yenilənmiş başlıq" } });
    check("öz rəyini dəyişir: 200, rating 4", r.status === 200 && r.body?.rating === 4 && r.body?.title === "Yenilənmiş başlıq");
    check("dəyişəndən sonra səslər qalır (yes 2, no 1)", r.body?.helpful?.yes === 2 && r.body?.helpful?.no === 1);
    check("başqasının rəyini dəyişmək → 404", (await call("PATCH", `/reviews/${r1.id}`, { token: u2, json: { rating: 1 } })).status === 404);
    check("boş body → 400", (await call("PATCH", `/reviews/${r1.id}`, { token: u1, json: {} })).status === 400);
    check("helpfulYes göndərmək → 400", (await call("PATCH", `/reviews/${r1.id}`, { token: u1, json: { helpfulYes: 100 } })).status === 400);

    console.log("Silmək");
    check("başqasının rəyini silmək → 404", (await call("DELETE", `/reviews/${r1.id}`, { token: u2 })).status === 404);
    check("tokensiz silmək → 401", (await call("DELETE", `/reviews/${r1.id}`)).status === 401);
    check("öz rəyini silir → 204", (await call("DELETE", `/reviews/${r1.id}`, { token: u1 })).status === 204);
    check("rəy getdi, səsləri də getdi (cascade)", (await prisma.reviewVote.count({ where: { reviewId: r1.id } })) === 0 && (await call("GET", `/books/${book}/reviews`)).body?.summary?.totalReviews === 3);
    check("silindikdən sonra eyni kitaba yenidən yaza bilir", (await rv(u1, { rating: 5, title: "Yenidən yazıram", body: text10 })).status === 201);
    check("admin istənilən rəyi silir (moderasiya) → 204", (await call("DELETE", `/reviews/${r4.id}`, { token: admin })).status === 204);
    check("olmayan rəyi silmək → 404", (await call("DELETE", "/reviews/99999999", { token: u1 })).status === 404);

    console.log("Kitab silinəndə");
    check("admin kitabı silir → 204", (await call("DELETE", `/admin/books/${book2}`, { token: admin })).status === 204);
    check("kitabın rəyləri də silinib (cascade)", (await prisma.review.count({ where: { bookId: book2 } })) === 0);
  } finally {
    await prisma.book.deleteMany({ where: { id: { in: [book, book2] } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: "rev", endsWith: `${stamp}@test.az` } } });
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