import { Router } from "express";
import * as controller from "../controllers/admin.controller";
import * as bookController from "../controllers/admin-book.controller";
import * as promoController from "../controllers/admin-promo.controller";
import * as orderController from "../controllers/admin-order.controller";
import * as contactController from "../controllers/contact.controller";
import * as giftCardController from "../controllers/gift-card.controller";
import * as storeController from "../controllers/store.controller";
import * as statsController from "../controllers/admin-stats.controller";
import { adminOnly } from "../middleware/stacks";
import { uploadCover } from "../middleware/upload";

const router = Router();
router.use(adminOnly);

router.get("/users", controller.listUsers);

router.get("/books", bookController.listBooks);
router.post("/books", bookController.createBook);
router.patch("/books/:id", bookController.updateBook);
router.delete("/books/:id", bookController.deleteBook);
router.post("/books/:id/cover", uploadCover, bookController.uploadCover);

router.get("/promos", promoController.listPromos);
router.post("/promos", promoController.createPromo);
router.patch("/promos/:id", promoController.updatePromo);
router.delete("/promos/:id", promoController.deletePromo);

router.get("/orders", orderController.listOrders);
router.get("/orders/:id", orderController.getOrder);
router.patch("/orders/:id/status", orderController.updateStatus);

router.get("/contact-messages", contactController.listMessages);
router.patch("/contact-messages/:id", contactController.markRead);
router.delete("/contact-messages/:id", contactController.deleteMessage);

router.get("/newsletter", contactController.listSubscribers);

router.post("/gift-cards", giftCardController.createGiftCard);
router.get("/gift-cards", giftCardController.listGiftCards);
router.patch("/gift-cards/:id", giftCardController.updateGiftCard);

router.post("/stores", storeController.createStore);
router.patch("/stores/:id", storeController.updateStore);
router.delete("/stores/:id", storeController.deleteStore);

router.post("/events", storeController.createEvent);
router.patch("/events/:id", storeController.updateEvent);
router.delete("/events/:id", storeController.deleteEvent);

router.get("/stats/overview", statsController.overview);
router.get("/stats/sales", statsController.sales);
router.get("/stats/top-books", statsController.topBooks);
router.get("/stats/low-stock", statsController.lowStock);

export default router;