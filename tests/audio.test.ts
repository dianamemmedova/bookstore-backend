import { readdir, unlink } from "node:fs/promises";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AUDIO_DIR } from "../src/lib/audio-storage";
import { signToken } from "../src/lib/jwt";
import { api, bearer, checkoutBody, makeAdmin, makeBook, makeUser, prisma, resetDb } from "./helpers";

let admin: Awaited<ReturnType<typeof makeAdmin>>;
let buyer: Awaited<ReturnType<typeof makeUser>>;
let other: Awaited<ReturnType<typeof makeUser>>;
let book: Awaited<ReturnType<typeof makeBook>>;

// "ID3" ilə başlayan sadə MP3 görünüşlü fayl (5000 bayt)
const fakeMp3 = () => Buffer.concat([Buffer.from("ID3"), Buffer.alloc(4997, 1)]);
const upload = (id: number, token: string, buf: Buffer, field = "audio", name = "kitab.mp3") =>
  api().post(`/admin/books/${id}/audio`).set(bearer(token)).attach(field, buf, name);
const buy = async (token: string, bookId: number) => {
  await api().put(`/cart/items/${bookId}`).set(bearer(token)).send({ quantity: 1 });
  const res = await api().post("/orders").set(bearer(token)).send(checkoutBody());
  expect(res.status).toBe(201);
  return res.body.id as number;
};

// Hər testdən əvvəl və sonra audio qovluğu təmizlənir (baza təmizlənir, fayllar isə qalırdı)
async function cleanAudioDir() {
  const files = await readdir(AUDIO_DIR).catch(() => []);
  await Promise.all(files.map((f) => unlink(`${AUDIO_DIR}/${f}`).catch(() => {})));
}

beforeEach(async () => {
  await cleanAudioDir();
  await resetDb();
  admin = await makeAdmin();
  buyer = await makeUser();
  other = await makeUser();
  book = await makeBook({ price: 10, stock: null });
});

afterAll(cleanAudioDir);

describe("Audio yükləmə (admin)", () => {
  it("mp3 yüklənir: hasAudio və isAudiobook true olur, fayl adı cavabda görünmür", async () => {
    const res = await upload(book.id, admin.token, fakeMp3());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ hasAudio: true, isAudiobook: true });
    expect(JSON.stringify(res.body)).not.toContain("audioFile");
    const pub = await api().get(`/books/${book.id}`);
    expect(pub.body.hasAudio).toBe(true);
    expect(JSON.stringify(pub.body)).not.toContain(".mp3");
  });

  it("audio olmayan fayl rədd edilir və diskdə iz qalmır", async () => {
    const before = await readdir(AUDIO_DIR).catch(() => []);
    const res = await upload(book.id, admin.token, Buffer.from("bu sadə mətn faylıdır, audio deyil"));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_AUDIO");
    expect((await readdir(AUDIO_DIR)).length).toBe(before.length);
  });

  it("yanlış sahə adı 400, adi istifadəçi 403, olmayan kitab 404", async () => {
    expect((await upload(book.id, admin.token, fakeMp3(), "cover")).status).toBe(400);
    expect((await upload(book.id, buyer.token, fakeMp3())).status).toBe(403);
    expect((await upload(99999, admin.token, fakeMp3())).status).toBe(404);
  });

  it("yenisini yükləyəndə köhnə fayl silinir, audio silinəndə hasAudio false olur", async () => {
    await upload(book.id, admin.token, fakeMp3());
    await upload(book.id, admin.token, fakeMp3());
    expect((await readdir(AUDIO_DIR)).length).toBe(1);
    const res = await api().delete(`/admin/books/${book.id}/audio`).set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.hasAudio).toBe(false);
    expect((await readdir(AUDIO_DIR)).length).toBe(0);
  });
});

describe("Audio dinləmə icazəsi", () => {
  beforeEach(async () => {
    await upload(book.id, admin.token, fakeMp3());
  });

  it("girişsiz 401, almayan 403, audiosu olmayan kitab 404", async () => {
    expect((await api().get(`/books/${book.id}/audio-access`)).status).toBe(401);
    expect((await api().get(`/books/${book.id}/audio-access`).set(bearer(other.token))).status).toBe(403);
    const noAudio = await makeBook({ stock: null });
    expect((await api().get(`/books/${noAudio.id}/audio-access`).set(bearer(admin.token))).status).toBe(404);
  });

  it("kitabı alan link alır, admin də alır, ləğv olunmuş sifariş icazə vermir", async () => {
    const orderId = await buy(buyer.token, book.id);
    const ok = await api().get(`/books/${book.id}/audio-access`).set(bearer(buyer.token));
    expect(ok.status).toBe(200);
    expect(ok.body.url).toMatch(/^\/audio\/.+/);
    expect((await api().get(`/books/${book.id}/audio-access`).set(bearer(admin.token))).status).toBe(200);

    await prisma.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
    expect((await api().get(`/books/${book.id}/audio-access`).set(bearer(buyer.token))).status).toBe(403);
  });

  it("başqasının sifarişi icazə vermir", async () => {
    await buy(buyer.token, book.id);
    expect((await api().get(`/books/${book.id}/audio-access`).set(bearer(other.token))).status).toBe(403);
  });
});

describe("Audio axını", () => {
  let url: string;

  beforeEach(async () => {
    await upload(book.id, admin.token, fakeMp3());
    await buy(buyer.token, book.id);
    url = (await api().get(`/books/${book.id}/audio-access`).set(bearer(buyer.token))).body.url;
  });

  it("link ilə fayl tam gəlir", async () => {
    const res = await api().get(url).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("audio/mpeg");
    expect(res.headers["accept-ranges"]).toBe("bytes");
    expect((res.body as Buffer).length).toBe(5000);
  });

  it("Range sorğusu 206 qaytarır (pleyerdə irəli-geri çəkmək üçün)", async () => {
    const res = await api().get(url).set("Range", "bytes=0-99").buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(206);
    expect(res.headers["content-range"]).toBe("bytes 0-99/5000");
    expect((res.body as Buffer).length).toBe(100);
  });

  it("saxta və ya giriş tokeni ilə açılmır", async () => {
    expect((await api().get("/audio/saxta-token-saxta-token")).status).toBe(401);
    const login = signToken({ sub: buyer.id, email: buyer.email, role: "USER" });
    expect((await api().get(`/audio/${login}`)).status).toBe(401);
  });

  it("audio silinəndən sonra köhnə link 404 verir", async () => {
    await api().delete(`/admin/books/${book.id}/audio`).set(bearer(admin.token));
    expect((await api().get(url)).status).toBe(404);
  });
});