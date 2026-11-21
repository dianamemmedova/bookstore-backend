import { authMiddleware, optionalAuth } from "./auth.middleware";
import { requireRole } from "./require-role.middleware";
import { Role } from "../generated/prisma/client";

export const authenticated = [authMiddleware];
export const adminOnly = [authMiddleware, requireRole(Role.ADMIN)];
export const optionallyAuthenticated = [optionalAuth];




// import { authMiddleware } from "./auth.middleware";
// import { requireRole } from "./require-role.middleware";
// import { Role } from "../generated/prisma/client";

// export const authenticated = [authMiddleware];
// // Yəni authenticated dedikdə istifadəçinin tokeninin yoxlanılması nəzərdə tutulur.
// // router.get("/profile", ...authenticated, getProfile);


// export const adminOnly = [authMiddleware, requireRole(Role.ADMIN)];
// // İstifadəçinin rolunun ADMIN olub-olmadığını yoxlayır.
// // router.delete("/users/:id", ...adminOnly, deleteUser);
// // asaqidaki router ile eyni menasi var
// // router.delete( "/users/:id", authMiddleware, requireRole(Role.ADMIN),deleteUser);