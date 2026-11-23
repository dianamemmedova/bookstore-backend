import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// Testlər AYRI bazada işləyir (adı _test ilə bitməlidir). Həqiqi bazaya heç vaxt toxunmur.
loadEnv({ path: ".env.test", quiet: true });

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // Fayllar ardıcıl işləyir: hamısı eyni bazadan istifadə edir və hər fayl əvvəl bazanı təmizləyir
    fileParallelism: false,
    silent: true,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      JWT_SECRET: "test-secret-test-secret-test-secret-123456",
      JWT_TTL_SECONDS: "3600",
      CORS_ORIGINS: "",
    },
  },
});