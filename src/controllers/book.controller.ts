import type { Request, Response } from "express";
import * as bookService from "../services/book.service";
import { bookIdParamSchema, listBooksQuerySchema } from "../schemas/book.schema";

export async function listBooks(req: Request, res: Response) {
  const query = listBooksQuerySchema.parse(req.query);
  res.json(await bookService.listBooks(query));
}

export async function getBook(req: Request, res: Response) {
  const { id } = bookIdParamSchema.parse(req.params);
  res.json(await bookService.getBook(id));
}