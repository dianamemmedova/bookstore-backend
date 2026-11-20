// 1. middlevare yaradiriq deye requestHandleri import edirik
import type { RequestHandler } from "express"

// 2. role yoxlamasi edeciyin deye Role modelinin typesin import edirik
import type { Role } from "../generated/prisma/client"

// 3. yaranacaq errorla uyqun errorlari import edirik
import { ForbiddenError, UnauthorizedError } from "../lib/errors"

// ...allowed icaze verir ki birden çox role yaza bilek requireRole("ADMIN", "USER") - bu formada
export function requireRole(...allowed: Role[]): RequestHandler {
    return (req, _res, next) => {
        // user yoxdusa login olunmuyub yeni 401 eroru 
        if (!req.user) throw new UnauthorizedError(); 
        // icaze verilmemisdise 403 error
        if (!allowed.includes(req.user.role)) throw new ForbiddenError();
        next();
    }
}

// router.get( "/admin",authMiddleware,requireRole("ADMIN"), getAdminData);
// proyekdimizde admin rutuna getmeye çalişanda kimse hansi ki rolu = user olanlar
// forbidden 403 erroru alacaq, 401 almir çünki logini var ama icazesi yoxdu aadmin rutuna