import { Router } from "express";
import * as controller from "../controllers/wishlist.controller";
import { authenticated } from "../middleware/stacks";

// Giriş tələb edən: öz siyahılarım
export const wishlistRouter = Router();
wishlistRouter.use(authenticated);

wishlistRouter.get("/", controller.listMine);
wishlistRouter.post("/", controller.create);
wishlistRouter.get("/:id", controller.getMine);
wishlistRouter.patch("/:id", controller.update);
wishlistRouter.delete("/:id", controller.remove);
wishlistRouter.put("/:id/items/:bookId", controller.addItem);
wishlistRouter.delete("/:id/items/:bookId", controller.removeItem);

// Tokensiz: yalnız açıq (isPublic) siyahıya baxış
export const publicWishlistRouter = Router();
publicWishlistRouter.get("/:id", controller.getPublic);