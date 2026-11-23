import { Router } from "express";
import * as controller from "../controllers/review.controller";
import { authenticated, optionallyAuthenticated } from "../middleware/stacks";

// /books/:bookId/reviews: kitabın rəyləri (oxumaq açıqdır, yazmaq giriş tələb edir)
export const bookReviewRouter = Router({ mergeParams: true });
bookReviewRouter.get("/", optionallyAuthenticated, controller.listReviews);
bookReviewRouter.post("/", authenticated, controller.createReview);

// /reviews/:id: konkret rəy üzərində əməliyyatlar
export const reviewRouter = Router();
reviewRouter.use(authenticated);
reviewRouter.patch("/:id", controller.updateReview);
reviewRouter.delete("/:id", controller.deleteReview);
reviewRouter.put("/:id/vote", controller.setVote);
reviewRouter.delete("/:id/vote", controller.removeVote);