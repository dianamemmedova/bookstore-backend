// İstifadə (PowerShell):
//   $env:ADMIN_EMAIL="admin@bookstore.az"; $env:ADMIN_PASSWORD="AdminParol123"; node scripts/smoke-promos.mjs
// Server işləməlidir. Admin test promo kodu yaradır, qonaq və adi istifadəçi ilə yoxlayır, sonda silir.
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("ADMIN_EMAIL və ADMIN_PASSWORD yaz (faylın başındakı nümunəyə bax).");
  process.exit(1);
}

let passed = 0;
let failed = 0;

async function call(method, path, { token, json } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: json ? JSON.stringify(json) : undefined });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body };
}

function check(name, condition, extra = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function main() {
  const login = await call("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const admin = login.body?.token;
  if (!admin) return console.log("Admin login alınmadı, dayanıram.");

  const reg = await call("POST", "/auth/register", {
    json: { firstName: "Promo", lastName: "Tester", email: `promo${Date.now()}@test.az`, password: "12345678" },
  });
  const user = reg.body?.token;

  const CODE = `SMOKE${Date.now()}`;

  console.log("Admin: icazələr");
  check("tokensiz yaratma 401", (await call("POST", "/admin/promos", { json: { code: CODE, discountPercent: 10 } })).status === 401);
  check("adi istifadəçi yarada bilmir 403", (await call("POST", "/admin/promos", { token: user, json: { code: CODE, discountPercent: 10 } })).status === 403);
  check("adi istifadəçi siyahını görə bilmir 403", (await call("GET", "/admin/promos", { token: user })).status === 403);

  console.log("Admin: yaratmaq");
  let r = await call("POST", "/admin/promos", { token: admin, json: { code: `  ${CODE.toLowerCase()} `, discountPercent: 25, description: "Smoke test" } });
  check("yaratma 201", r.status === 201, `(${r.status})`);
  const id = r.body?.id;
  check("kod böyük hərfə çevrilir, aktivdir, usedCount 0", r.body?.code === CODE && r.body?.isActive === true && r.body?.usedCount === 0);
  r = await call("POST", "/admin/promos", { token: admin, json: { code: CODE, discountPercent: 5 } });
  check("eyni kod 409 PROMO_CODE_TAKEN", r.status === 409 && r.body?.error?.code === "PROMO_CODE_TAKEN");
  check("discountPercent 0 → 400", (await call("POST", "/admin/promos", { token: admin, json: { code: "BAD1", discountPercent: 0 } })).status === 400);
  check("discountPercent 91 → 400", (await call("POST", "/admin/promos", { token: admin, json: { code: "BAD2", discountPercent: 91 } })).status === 400);
  check("discountPercent 10.5 → 400", (await call("POST", "/admin/promos", { token: admin, json: { code: "BAD3", discountPercent: 10.5 } })).status === 400);
  check("kodda xüsusi simvol → 400", (await call("POST", "/admin/promos", { token: admin, json: { code: "a!b", discountPercent: 10 } })).status === 400);
  check("expiresAt yanlış format → 400", (await call("POST", "/admin/promos", { token: admin, json: { code: "BAD4", discountPercent: 10, expiresAt: "sabah" } })).status === 400);
  check("artıq sahə (usedCount) → 400", (await call("POST", "/admin/promos", { token: admin, json: { code: "BAD5", discountPercent: 10, usedCount: 99 } })).status === 400);

  console.log("Müştəri: yoxlama");
  r = await call("POST", "/promo/validate", { json: { code: `  ${CODE.toLowerCase()}  ` } });
  check("qonaq yoxlaya bilir, kiçik hərf və boşluq problem deyil", r.status === 200 && r.body?.code === CODE && r.body?.discountPercent === 25);
  check("cavabda id və isActive açıqlanmır", r.body?.id === undefined && r.body?.isActive === undefined);
  check("giriş etmiş istifadəçi də yoxlaya bilir", (await call("POST", "/promo/validate", { token: user, json: { code: CODE } })).status === 200);
  r = await call("POST", "/promo/validate", { json: { code: "YOXDUR12345" } });
  check("olmayan kod 400 PROMO_INVALID", r.status === 400 && r.body?.error?.code === "PROMO_INVALID");
  check("boş kod 400", (await call("POST", "/promo/validate", { json: { code: "   " } })).status === 400);
  check("kod göndərilməyib 400", (await call("POST", "/promo/validate", { json: {} })).status === 400);
  check("artıq sahə göndərmək 400", (await call("POST", "/promo/validate", { json: { code: CODE, discount: 99 } })).status === 400);
  check("etibarsız token 401 (qonaq kimi keçmir)", (await call("POST", "/promo/validate", { token: "yalan.token.burada", json: { code: CODE } })).status === 401);

  console.log("Admin: dəyişmək");
  r = await call("PATCH", `/admin/promos/${id}`, { token: admin, json: { isActive: false } });
  check("deaktiv etmək 200", r.status === 200 && r.body?.isActive === false);
  r = await call("POST", "/promo/validate", { json: { code: CODE } });
  check("deaktiv kod 400 PROMO_INVALID (səbəb açıqlanmır)", r.status === 400 && r.body?.error?.code === "PROMO_INVALID");
  await call("PATCH", `/admin/promos/${id}`, { token: admin, json: { isActive: true, expiresAt: "2020-01-01T00:00:00Z" } });
  check("müddəti bitmiş kod 400", (await call("POST", "/promo/validate", { json: { code: CODE } })).status === 400);
  await call("PATCH", `/admin/promos/${id}`, { token: admin, json: { expiresAt: "2099-01-01T00:00:00Z" } });
  check("müddəti gələcəkdə olan kod 200", (await call("POST", "/promo/validate", { json: { code: CODE } })).status === 200);
  r = await call("PATCH", `/admin/promos/${id}`, { token: admin, json: { expiresAt: null, discountPercent: 30 } });
  check("müddəti silmək (null) və faizi dəyişmək", r.status === 200 && r.body?.expiresAt === null && r.body?.discountPercent === 30);
  check("yeni faiz müştəriyə görünür", (await call("POST", "/promo/validate", { json: { code: CODE } })).body?.discountPercent === 30);
  check("kodu dəyişmək olmaz (400)", (await call("PATCH", `/admin/promos/${id}`, { token: admin, json: { code: "YENI" } })).status === 400);
  check("boş PATCH 400", (await call("PATCH", `/admin/promos/${id}`, { token: admin, json: {} })).status === 400);
  check("olmayan kod PATCH 404", (await call("PATCH", "/admin/promos/99999999", { token: admin, json: { isActive: false } })).status === 404);

  console.log("Admin: siyahı və silmə");
  r = await call("GET", "/admin/promos?limit=100", { token: admin });
  check("siyahıda görünür, usedCount 0", r.status === 200 && r.body?.items?.some((p) => p.code === CODE && p.usedCount === 0));
  check("limit 101 → 400", (await call("GET", "/admin/promos?limit=101", { token: admin })).status === 400);
  check("silmək 204", (await call("DELETE", `/admin/promos/${id}`, { token: admin })).status === 204);
  check("silinmiş kod müştəriyə 400", (await call("POST", "/promo/validate", { json: { code: CODE } })).status === 400);
  check("olmayan kodu silmək 404", (await call("DELETE", `/admin/promos/${id}`, { token: admin })).status === 404);

  console.log(`\nNəticə: ${passed} keçdi, ${failed} kəsildi`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error("Skript xəta ilə dayandı:", error.message);
  process.exit(1);
});