import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./openapi";

const router = Router();

// Xam spesifikasiya (kod generatoru, Postman import və s. üçün)
router.get("/openapi.json", (_req, res) => {
  res.json(openApiSpec);
});

// Swagger UI: brauzerdə interaktiv sənəd. Swagger-in öz fayllarını serverdən verir (CDN lazım deyil).
// helmet-in default CSP-sindəki "upgrade-insecure-requests" http://localhost-da bəzi brauzerlərdə (Safari)
// Swagger fayllarını https-ə yönləndirib sındırır. Ona görə yalnız /docs üçün CSP-ni özümüz təyin edirik (digər route-lara toxunmur).
router.use("/docs", (_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'",
  );
  next();
});
router.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: "Book & Store API", swaggerOptions: { persistAuthorization: true } }));

export default router;