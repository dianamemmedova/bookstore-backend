import type { Request, Response } from "express";
import * as contactService from "../services/contact.service";
import * as newsletterService from "../services/newsletter.service";
import {
  adminContactQuerySchema,
  adminNewsletterQuerySchema,
  contactSchema,
  idParamSchema,
  markReadSchema,
  newsletterSubscribeSchema,
  newsletterUnsubscribeSchema,
} from "../schemas/contact.schema";

// --- Açıq ---

export async function sendContact(req: Request, res: Response) {
  const input = contactSchema.parse(req.body);
  res.status(201).json(await contactService.createContactMessage(input, req.user?.sub));
}

export async function subscribe(req: Request, res: Response) {
  const { email } = newsletterSubscribeSchema.parse(req.body);
  res.json(await newsletterService.subscribe(email));
}

export async function unsubscribe(req: Request, res: Response) {
  const { token } = newsletterUnsubscribeSchema.parse(req.body);
  res.json(await newsletterService.unsubscribe(token));
}

// --- Admin ---

export async function listMessages(req: Request, res: Response) {
  res.json(await contactService.listContactMessages(adminContactQuerySchema.parse(req.query)));
}

export async function markRead(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  const { isRead } = markReadSchema.parse(req.body);
  res.json(await contactService.markContactRead(Number(id), isRead));
}

export async function deleteMessage(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  await contactService.deleteContactMessage(Number(id));
  res.status(204).end();
}

export async function listSubscribers(req: Request, res: Response) {
  res.json(await newsletterService.listSubscribers(adminNewsletterQuerySchema.parse(req.query)));
}