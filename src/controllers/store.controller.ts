import type { Request, Response } from "express";
import * as storeService from "../services/store.service";
import {
  createEventSchema,
  createStoreSchema,
  idParamSchema,
  listEventsQuerySchema,
  updateEventSchema,
  updateStoreSchema,
} from "../schemas/store.schema";

// --- Açıq ---

export async function listStores(_req: Request, res: Response) {
  res.json(await storeService.listStores());
}

export async function getStore(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  res.json(await storeService.getStore(Number(id)));
}

export async function listEvents(req: Request, res: Response) {
  res.json(await storeService.listEvents(listEventsQuerySchema.parse(req.query)));
}

export async function getEvent(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  res.json(await storeService.getEvent(Number(id)));
}

// --- Admin ---

export async function createStore(req: Request, res: Response) {
  res.status(201).json(await storeService.createStore(createStoreSchema.parse(req.body)));
}

export async function updateStore(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  res.json(await storeService.updateStore(Number(id), updateStoreSchema.parse(req.body)));
}

export async function deleteStore(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  await storeService.deleteStore(Number(id));
  res.status(204).end();
}

export async function createEvent(req: Request, res: Response) {
  res.status(201).json(await storeService.createEvent(createEventSchema.parse(req.body)));
}

export async function updateEvent(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  res.json(await storeService.updateEvent(Number(id), updateEventSchema.parse(req.body)));
}

export async function deleteEvent(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  await storeService.deleteEvent(Number(id));
  res.status(204).end();
}