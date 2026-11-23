// İstifadə (PowerShell, server işləyərkən başqa pəncərədə): npx tsx scripts/check-docs.ts
// OpenAPI sənədinin düzgünlüyünü yoxlayır:
//   1) spesifikasiya etibarlı OpenAPI 3.1-dir
//   2) src/routes-dakı endpoint sayı sənəddəki ilə eynidir (yeni route əlavə edib sənədləşdirməyi unutsan xəta verir)
//   3) sənəddəki hər endpoint serverdə həqiqətən var (sənəddə olub kodda olmayan yoxdur)
//   4) /docs səhifəsi açılır
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import { openApiSpec, OPERATION_KEYS } from "../src/docs/openapi";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function main() {
  console.log("Spesifikasiya");
  try {
    await SwaggerParser.validate(structuredClone(openApiSpec) as never);
    check("OpenAPI 3.1 qaydalarına uyğundur", true);
  } catch (error) {
    check("OpenAPI 3.1 qaydalarına uyğundur", false, (error as Error).message);
  }
  check("hər endpoint-in unikal açarı var (dublikat yoxdur)", new Set(OPERATION_KEYS).size === OPERATION_KEYS.length);

  console.log("Kodla müqayisə");
  const routesDir = join(import.meta.dirname, "..", "src", "routes");
  let routeCount = 0;
  for (const file of readdirSync(routesDir)) {
    const text = readFileSync(join(routesDir, file), "utf8");
    routeCount += (text.match(/[Rr]outer\.(get|post|put|patch|delete)\(/g) ?? []).length;
  }
  check(`src/routes-dakı endpoint sayı (${routeCount}) sənəddəki ilə (${OPERATION_KEYS.length}) eynidir`, routeCount === OPERATION_KEYS.length, "Yeni route əlavə etmisənsə src/docs/openapi.ts-ə də əlavə et");

  console.log("Sənəddəki hər endpoint serverdə var");
  const missing: string[] = [];
  for (const key of OPERATION_KEYS) {
    const [method, path] = key.split(" ");
    const url = path.replace(/\{[^}]+\}/g, "1");
    const res = await fetch(BASE + url, { method, headers: { "Content-Type": "application/json" }, body: method === "GET" || method === "DELETE" ? undefined : "{}" });
    const body: any = await res.json().catch(() => null);
    // Mövcud olmayan route-da "notFound" middleware-i "<METHOD> /yol tapilmadi" yazır; resurs 404-ləri belə başlamır
    if (res.status === 404 && typeof body?.error?.message === "string" && body.error.message.startsWith(`${method} `)) missing.push(key);
  }
  check(`${OPERATION_KEYS.length} endpoint-in hamısı serverdə mövcuddur`, missing.length === 0, `Serverdə yoxdur: ${missing.join(", ")}`);

  console.log("Sənəd səhifəsi");
  const docs = await fetch(`${BASE}/docs/`);
  const html = await docs.text();
  check("/docs açılır (Swagger UI)", docs.status === 200 && html.includes("swagger-ui"));
  const csp = docs.headers.get("content-security-policy") ?? "";
  check("/docs CSP-sində upgrade-insecure-requests yoxdur", !csp.includes("upgrade-insecure-requests"));
  const json = await fetch(`${BASE}/openapi.json`);
  check("/openapi.json açılır", json.status === 200 && (await json.json() as { openapi?: string }).openapi === "3.1.0");

  console.log(`\nNəticə: ${passed} keçdi, ${failed} kəsildi`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error("Skript xəta ilə dayandı:", error);
  process.exit(1);
});