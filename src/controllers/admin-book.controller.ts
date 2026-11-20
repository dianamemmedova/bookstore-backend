import type { Request, Response } from "express";
import * as bookService from "../services/book.service";
import { BadRequestError } from "../lib/errors";
import { bookIdParamSchema, createBookSchema, updateBookSchema } from "../schemas/book.schema";

export async function createBook(req: Request, res: Response) {
  const input = createBookSchema.parse(req.body);
  res.status(201).json(await bookService.createBook(input));
}

export async function updateBook(req: Request, res: Response) {
  const { id } = bookIdParamSchema.parse(req.params);
  const input = updateBookSchema.parse(req.body);
  res.json(await bookService.updateBook(id, input));
}

export async function deleteBook(req: Request, res: Response) {
  const { id } = bookIdParamSchema.parse(req.params);
  await bookService.deleteBook(id);
  res.status(204).end();
}

export async function uploadCover(req: Request, res: Response) {
  const { id } = bookIdParamSchema.parse(req.params);
  if (!req.file) {
    throw new BadRequestError("cover adlı fayl göndərilməlidir (multipart/form-data)", "FILE_REQUIRED");
  }
  res.json(await bookService.setBookCover(id, req.file.buffer));
}