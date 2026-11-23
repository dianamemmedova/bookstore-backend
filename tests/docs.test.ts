import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import { api } from "./helpers";
import { openApiSpec, OPERATION_KEYS } from "../src/docs/openapi";

function countRouteDefinitions() {
  const dir = join(process.cwd(), "src", "routes");
  let n = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    n += (readFileSync(join(dir, f), "utf8").match(/^\s*\w+\.(get|post|put|patch|delete)\(/gm) ?? []).length;
  }
  return n;
}

describe("OpenAPI sənədi", () => {
  it("etibarlı OpenAPI 3.1 sənədidir", async () => {
    await expect(SwaggerParser.validate(structuredClone(openApiSpec) as never)).resolves.toBeDefined();
  });

  it("src/routes-dakı hər endpoint sənədləşdirilib (yeni route əlavə edib sənədi unutsan test sınır)", () => {
    expect(OPERATION_KEYS.length).toBe(countRouteDefinitions());
  });

  it("/openapi.json və /docs açılır", async () => {
    const spec = await api().get("/openapi.json");
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toMatch(/^3\.1/);
    const docs = await api().get("/docs/");
    expect(docs.status).toBe(200);
    expect(docs.headers["content-security-policy"] ?? "").not.toContain("upgrade-insecure-requests");
  });
});