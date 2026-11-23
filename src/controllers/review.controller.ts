import type { Request, Response } from "express";
import * as reviewService from "../services/review.service";
import {
  createReviewSchema,
  listReviewsQuerySchema,
  reviewBookParamSchema,
  reviewIdParamSchema,
  updateReviewSchema,
  voteSchema,
} from "../schemas/review.schema";

export async function listReviews(req: Request, res: Response) {
  const { bookId } = reviewBookParamSchema.parse(req.params);
  const query = listReviewsQuerySchema.parse(req.query);
  res.json(await reviewService.listReviews(Number(bookId), query, req.user?.sub));
}

export async function createReview(req: Request, res: Response) {
  const { bookId } = reviewBookParamSchema.parse(req.params);
  const input = createReviewSchema.parse(req.body);
  res.status(201).json(await reviewService.createReview(req.user!.sub, Number(bookId), input));
}

export async function updateReview(req: Request, res: Response) {
  const { id } = reviewIdParamSchema.parse(req.params);
  const input = updateReviewSchema.parse(req.body);
  res.json(await reviewService.updateReview(req.user!.sub, Number(id), input));
}

export async function deleteReview(req: Request, res: Response) {
  const { id } = reviewIdParamSchema.parse(req.params);
  await reviewService.deleteReview({ id: req.user!.sub, role: req.user!.role }, Number(id));
  res.status(204).end();
}

export async function setVote(req: Request, res: Response) {
  const { id } = reviewIdParamSchema.parse(req.params);
  const { helpful } = voteSchema.parse(req.body);
  res.json(await reviewService.setVote(req.user!.sub, Number(id), helpful));
}

export async function removeVote(req: Request, res: Response) {
  const { id } = reviewIdParamSchema.parse(req.params);
  res.json(await reviewService.removeVote(req.user!.sub, Number(id)));
}