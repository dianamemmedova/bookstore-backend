import { execSync } from "node:child_process";

// Bütün testlərdən əvvəl bir dəfə işləyir
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL yoxdur. .env.test faylı yarat və içinə test bazasının ünvanını yaz (README-dəki addımlara bax).",
    );
  }

  // TƏHLÜKƏSİZLİK: testlər cədvəlləri təmizləyir. Baza adı _test ilə bitmirsə dayanırıq ki, real məlumat silinməsin.
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(`Test bazasının adı "_test" ilə bitməlidir (indi: "${dbName}"). Real bazanı qorumaq üçün dayandırıldı.`);
  }

  // Test bazasına bütün migrasiyaları tətbiq edir (cədvəllər hazır olur). SKIP_MIGRATE=1 ilə keçmək olar.
  if (process.env.SKIP_MIGRATE !== "1") {
    execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
  }
}