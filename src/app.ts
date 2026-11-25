import express from "express";
import helmet from "helmet";
import cors from "cors";
import { requestId } from "./middleware/request-id";
import { timing } from "./middleware/timing";
import { errorHandler, notFound } from "./middleware/error-handler";
import { prisma } from "./lib/prisma";
import { config } from "./config";
import authRoutes from "./routes/auth.routes";
import meRoutes from "./routes/me.routes";
import adminRoutes from "./routes/admin.routes";
import bookRoutes from "./routes/book.routes";
import cartRoutes from "./routes/cart.routes";
import promoRoutes from "./routes/promo.routes";
import orderRoutes from "./routes/order.routes";
import contactRoutes from "./routes/contact.routes";
import newsletterRoutes from "./routes/newsletter.routes";
import giftCardRoutes from "./routes/gift-card.routes";
import { eventRouter, storeRouter } from "./routes/store.routes";
import { bookReviewRouter, reviewRouter } from "./routes/review.routes";
import { publicWishlistRouter, wishlistRouter } from "./routes/wishlist.routes";
import audioRoutes from "./routes/audio.routes";
import docsRoutes from "./docs/docs.routes";
import { UPLOADS_DIR } from "./lib/cover-storage";

const app = express();

app.use(requestId);
app.use(timing);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: config.CORS_ORIGINS }));
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "ok", uptime: Math.round(process.uptime()) });
  } catch {
    res.status(503).json({ status: "error", db: "down" });
  }
});
app.use(docsRoutes);
app.use("/uploads", express.static(UPLOADS_DIR, { index: false, dotfiles: "deny" }));
app.use("/audio", audioRoutes);
app.use("/auth", authRoutes);
app.use("/me", meRoutes);
app.use("/admin", adminRoutes);
app.use("/books/:bookId/reviews", bookReviewRouter);
app.use("/books", bookRoutes);
app.use("/reviews", reviewRouter);
app.use("/contact", contactRoutes);
app.use("/newsletter", newsletterRoutes);
app.use("/gift-cards", giftCardRoutes);
app.use("/stores", storeRouter);
app.use("/events", eventRouter);
app.use("/cart", cartRoutes);
app.use("/promo", promoRoutes);
app.use("/orders", orderRoutes);
app.use("/wishlists", wishlistRouter);
app.use("/public/wishlists", publicWishlistRouter);
// Route-lar həmişə bunlardan əvvəl, bu ikisi isə ən sonda qalmalıdır
app.use(notFound);
app.use(errorHandler);

export default app;