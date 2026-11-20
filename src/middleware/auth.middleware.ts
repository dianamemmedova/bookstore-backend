// 1. middlevare olduğu üçün requesthandleri import et
import type { RequestHandler } from "express";

// 2. tokeni yoxlamaliyiq deye verifyToken funskiyasini import et
import  { verifyToken } from "../lib/jwt"

// 3. tokende problem olsaa login ola bilmeyecek ve 401 unauthorized erroru verecek 
import { UnauthorizedError } from "../lib/errors";

// middlevare yaradiriq gelen tokeni yoxlasin deye
// yeni ki gelen sorğunun tokeni varmi deye yoxlamaq üçün
export const authMiddleware: RequestHandler = (req, _res, next) => {
   // sorqunun headerinden authorization hissesini gotururuk
    const header = req.headers.authorization;

    //sonra yoxluyuruq gorek basliqinda Bearer varmi 
    if (!header?.startsWith("Bearer ")) {
        // eger bearer sözü yoxdusa eror versin
        throw new UnauthorizedError("Token teqdim olunmayib");
    }

    try {
        // tokeni yoxlamaq funksiyasidi 
        // slice 7 = yəni ki ilk 7 simvolu çıx qalanin götür
        req.user = verifyToken(header.slice(7));
    } catch {
        throw new UnauthorizedError("Token etibarsizdir");
    }

    next();


 
}






























// import type { RequestHandler } from "express";
// import { verifyToken } from "../lib/jwt";
// import { UnauthorizedError } from "../lib/errors";

// export const authMiddleware: RequestHandler = (req, _res, next) => {
//   const header = req.headers.authorization;

//   if (!header?.startsWith("Bearer ")) {
//     throw new UnauthorizedError("Token təqdim edilməyib");
//   }

//   try {
//     req.user = verifyToken(header.slice(7));
//   } catch {
//     throw new UnauthorizedError("Token etibarsızdır");
//   }

//   next();
// };