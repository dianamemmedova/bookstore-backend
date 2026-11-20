// İstifadə (PowerShell):
//   $env:ADMIN_EMAIL="admin@mail.com"; $env:ADMIN_PASSWORD="parolun"; node scripts/smoke-books.mjs
// Server işləməlidir (npm run dev). Admin hesabının role-u bazada ADMIN olmalıdır.
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("ADMIN_EMAIL və ADMIN_PASSWORD mühit dəyişənlərini yaz (faylın başındakı nümunəyə bax).");
  process.exit(1);
}

let passed = 0;
let failed = 0;

async function call(method, path, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: json ? JSON.stringify(json) : form });
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

// 1x1 piksel real PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const coverForm = (buffer, filename, type, field = "cover") => {
  const form = new FormData();
  form.append(field, new Blob([buffer], { type }), filename);
  return form;
};

async function main() {
  console.log("Giriş");
  const login = await call("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  check("admin login 200", login.status === 200, `(${login.status})`);
  const admin = login.body?.token;
  if (!admin) return console.log("Login alınmadı, dayanıram.");
  check("hesabın rolu ADMIN-dir", login.body.user.role === "ADMIN", "(bazada role-u ADMIN et və yenidən login ol)");

  const email = `user${Date.now()}@test.az`;
  const reg = await call("POST", "/auth/register", {
    json: { firstName: "Test", lastName: "User", email, password: "12345678" },
  });
  const user = reg.body?.token;

  console.log("İcazələr");
  const book = { title: "Smoke Kitab", author: "Test Müəllif", price: 24.5, year: 2000, subjects: ["fantasy"], stock: 3 };
  check("tokensiz yaratmaq 401", (await call("POST", "/admin/books", { json: book })).status === 401);
  check("adi istifadəçi yarada bilmir 403", (await call("POST", "/admin/books", { token: user, json: book })).status === 403);

  console.log("Yaratmaq");
  const created = await call("POST", "/admin/books", { token: admin, json: book });
  check("yaratma 201", created.status === 201, `(${created.status})`);
  const id = created.body?.id;
  check("priceCents 2450, price 24.5", created.body?.priceCents === 2450 && created.body?.price === 24.5);
  check("price 10.123 rədd olunur 400", (await call("POST", "/admin/books", { token: admin, json: { ...book, price: 10.123 } })).status === 400);
  check("price mənfi rədd olunur 400", (await call("POST", "/admin/books", { token: admin, json: { ...book, price: -5 } })).status === 400);
  check("coverUrl göndərmək rədd olunur 400", (await call("POST", "/admin/books", { token: admin, json: { ...book, coverUrl: "http://x" } })).status === 400);
  if (!id) return console.log("Kitab yaranmadı, dayanıram.");

  console.log("Oxumaq (açıq)");
  const read = await call("GET", `/books/${id}`);
  check("detal 200 və başlıq düzdür", read.status === 200 && read.body?.title === "Smoke Kitab");
  const search = await call("GET", "/books?q=smoke%20kitab");
  check("axtarışda tapılır", search.body?.items?.some((b) => b.id === id));

  console.log("Dəyişmək");
  const patched = await call("PATCH", `/admin/books/${id}`, { token: admin, json: { price: 30, stock: 0 } });
  check("PATCH 200, qiymət 3000 qəpik", patched.status === 200 && patched.body?.priceCents === 3000);
  check("stock 0 olanda inStock false", patched.body?.inStock === false);
  check("boş PATCH 400", (await call("PATCH", `/admin/books/${id}`, { token: admin, json: {} })).status === 400);
  check("olmayan kitab PATCH 404", (await call("PATCH", "/admin/books/99999999", { token: admin, json: { price: 5 } })).status === 404);

  console.log("Üz qabığı");
  const cover = await call("POST", `/admin/books/${id}/cover`, { token: admin, form: coverForm(PNG, "a.png", "image/png") });
  check("şəkil yükləmə 200", cover.status === 200, `(${cover.status})`);
  const url = cover.body?.coverUrl;
  check("coverUrl /uploads/covers/ ilə başlayır", typeof url === "string" && url.startsWith("/uploads/covers/"));
  if (url) {
    const img = await fetch(BASE + url);
    check("şəkil brauzerlə açılır 200", img.status === 200 && (img.headers.get("content-type") ?? "").includes("image/png"));
  }
  const fake = await call("POST", `/admin/books/${id}/cover`, {
    token: admin,
    form: coverForm(Buffer.from("<?php echo 1; ?>"), "hack.png", "image/png"),
  });
  check("saxta şəkil (içi mətn) rədd olunur 400", fake.status === 400 && fake.body?.error?.code === "INVALID_IMAGE");
  const big = await call("POST", `/admin/books/${id}/cover`, {
    token: admin,
    form: coverForm(Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]), "big.png", "image/png"),
  });
  check("3 MB şəkil rədd olunur 400", big.status === 400);
  check("fayl göndərilməyəndə 400", (await call("POST", `/admin/books/${id}/cover`, { token: admin, form: new FormData() })).status === 400);
  check("adi istifadəçi yükləyə bilmir 403", (await call("POST", `/admin/books/${id}/cover`, { token: user, form: coverForm(PNG, "a.png", "image/png") })).status === 403);

  console.log("Silmək");
  check("adi istifadəçi silə bilmir 403", (await call("DELETE", `/admin/books/${id}`, { token: user })).status === 403);
  check("silmə 204", (await call("DELETE", `/admin/books/${id}`, { token: admin })).status === 204);
  check("silinəndən sonra 404", (await call("GET", `/books/${id}`)).status === 404);
  if (url) check("şəkil faylı da silinib 404", (await fetch(BASE + url)).status === 404);

  console.log(`\nNəticə: ${passed} keçdi, ${failed} kəsildi`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error("Skript xəta ilə dayandı:", error.message);
  process.exit(1);
});