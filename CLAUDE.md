# Project rules for AI assistants

## Project
Book & Store API: backend of an online bookstore (React frontend). Users register, fill a cart and wishlists, apply promo codes, place and cancel orders and write reviews; admins manage books, promos and order statuses.

## Stack
- Node.js 22, Express 5, TypeScript, PostgreSQL, Prisma 7, Zod 4, Vitest, JWT.
- Prisma client is imported only from src/lib/prisma.ts. Never create a new PrismaClient.
- Express 5 catches async errors: do not use asyncHandler, do not catch errors
  just to return res.status(500). Throw the error classes from src/lib/errors.ts.

## Structure
- src/schemas/<name>.schema.ts          Zod schemas + z.infer types
- src/services/<name>.service.ts        business logic and Prisma, no req/res
- src/controllers/<name>.controller.ts  parse input, call service, send response
- src/routes/<name>.routes.ts           routes + middleware
- The logged-in user is req.user!.sub (id) and req.user!.role.

## Models
- User 1-n Order, User 1-n WishlistList, Order 1-n OrderItem, WishlistList 1-n WishlistItem, Review 1-n ReviewVote
- User n-n Book through CartItem (quantity), through Review (rating, body), WishlistList n-n Book through WishlistItem
- User n-n PromoCode through PromoRedemption
- Book 1-n OrderItem (Restrict); OrderItem keeps a snapshot of title, author, cover and unit price
- Book.externalId is the Open Library id; Book.stock null means unlimited
- All money is an integer in qəpik (*Cents). Never use floats for money.

## Business rules (every rule must have a test)
- Email is unique -> 409 EMAIL_TAKEN.
- Prices are always computed on the server, client prices are ignored. Delivery fee 5 AZN, free when the total after discount is 60 AZN or more.
- Checkout is one transaction; stock is decremented with a conditional update (stock >= quantity). Not enough stock -> 409 OUT_OF_STOCK, nothing is written.
- A user can use each promo code only once (@@unique userId+promoCodeId) -> 409. Expired or inactive code -> 400.
- Another user's order, cart or wishlist -> 404.
- Only a CONFIRMED order can be cancelled, otherwise 409; cancelling restores stock.
- Delivery date must be at least 5 days from today -> 400.
- Card number, CVV and similar fields are never accepted or stored. Order schema is strict and only allows payMethod CARD or CASH -> 400.
- One review per user per book (@@unique) -> 409; one vote per user per review.
- Book/promo writes, order status changes and stats are ADMIN only; a normal user gets 403.

## Security
- Owned resources: add userId to the where clause in update/delete; not found -> 404.
- Validate every request body, params and query with Zod.
- Never return passwordHash. Secrets live only in .env.

## Commands
- npm run dev, npm test, npm run typecheck