import { Router } from "express";
import * as controller from "../controllers/store.controller";

// Hamısı açıqdır (giriş tələb olunmur): mağazalar və tədbirlər sayt ziyarətçiləri üçündür
export const storeRouter = Router();
storeRouter.get("/", controller.listStores);
storeRouter.get("/:id", controller.getStore);

export const eventRouter = Router();
eventRouter.get("/", controller.listEvents);
eventRouter.get("/:id", controller.getEvent);