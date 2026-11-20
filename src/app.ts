import express from "express";
import helmet from "helmet";
import cors from "cors";
import { requestId } from "./middleware/request-id";
import { timing } from "./middleware/timing";
import { errorHandler, notFound } from "./middleware/error-handler";
import { prisma } from "./lib/prisma";
import { config } from "./config";
import authRoutes from "./routes/auth.routes";

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
app.use("/auth", authRoutes);
// Route-lar həmişə bunlardan əvvəl, bu ikisi isə ən sonda qalmalıdır
app.use(notFound);
app.use(errorHandler);

export default app;