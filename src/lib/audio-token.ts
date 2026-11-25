import jwt from "jsonwebtoken";
import { config } from "../config";
import { ALGORITHM } from "./jwt";

export const AUDIO_TOKEN_TTL_SECONDS = 2 * 60 * 60;

type AudioTokenPayload = { purpose: "audio"; sub: number; bookId: number };

// Qısa ömürlü link tokeni: <audio> elementi Authorization başlığı göndərə bilmir, ona görə icazə linkin içindədir
export function signAudioToken(userId: number, bookId: number): string {
  const payload: AudioTokenPayload = { purpose: "audio", sub: userId, bookId };
  return jwt.sign(payload, config.JWT_SECRET, { algorithm: ALGORITHM, expiresIn: AUDIO_TOKEN_TTL_SECONDS });
}

export function verifyAudioToken(token: string): AudioTokenPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: [ALGORITHM] });
  // Giriş tokeni (purpose yoxdur) ilə audio linki açmaq olmaz
  if (typeof decoded === "string" || decoded.purpose !== "audio" || typeof decoded.bookId !== "number") {
    throw new Error("Audio token deyil");
  }
  return decoded as unknown as AudioTokenPayload;
}