import jwt from "jsonwebtoken";
import type { Role } from "../generated/prisma/client";
import { config } from "../config";


export type TokenPayload = {
    sub: number;
    email: string;
    role: Role;
}

export const ALGORITHM = "HS256" as const;

export function signToken(payload: TokenPayload): string {
    return jwt.sign(payload, config.JWT_SECRET, {
        algorithm: ALGORITHM,
        expiresIn: config.JWT_TTL_SECONDS,
    });
}

export function verifyToken(token: string): TokenPayload {
    const decoded = jwt.verify(token, config.JWT_SECRET, {
        algorithms: [ALGORITHM],
    });

    if (typeof decoded === "string") {
        throw new Error("Gozlenilmeyen token formati");
    }

    return decoded as unknown as TokenPayload;
}






















// import jwt from "jsonwebtoken";
// import type { Role } from "../generated/prisma/client";
// import { config } from "../config";

// export type TokenPayload = {
//   sub: number;
//   email: string;
//   role: Role;
// };

// export const ALGORITHM = "HS256" as const;

// export function signToken(payload: TokenPayload): string {
//   return jwt.sign(payload, config.JWT_SECRET, {
//     algorithm: ALGORITHM,
//     expiresIn: config.JWT_TTL_SECONDS,
//   });
// }

// export function verifyToken(token: string): TokenPayload {
//   const decoded = jwt.verify(token, config.JWT_SECRET, {
//     algorithms: [ALGORITHM],
//   });

//   if (typeof decoded === "string") {
//     throw new Error("Gözlənilməz token formatı");
//   }

//   return decoded as unknown as TokenPayload;
// }