import type { Order, OrderItem } from "../generated/prisma/client";

type OrderWithItems = Order & { items: OrderItem[] };
type OrderWithUser = OrderWithItems & { user: { id: number; email: string; firstName: string; lastName: string } };

// Front-un Order tipinə yaxın forma. Pul həm qəpiklə (…Cents), həm AZN ilə qaytarılır.
export function presentOrder(order: OrderWithItems) {
  return {
    id: order.id,
    status: order.status,
    payMethod: order.payMethod,
    items: order.items.map((item) => ({
      bookId: item.bookId,
      title: item.title,
      author: item.author,
      coverUrl: item.coverUrl,
      unitPriceCents: item.unitPriceCents,
      unitPrice: item.unitPriceCents / 100,
      quantity: item.quantity,
      lineTotalCents: item.unitPriceCents * item.quantity,
    })),
    subtotalCents: order.subtotalCents,
    subtotal: order.subtotalCents / 100,
    discountCents: order.discountCents,
    discountAmount: order.discountCents / 100,
    deliveryFeeCents: order.deliveryFeeCents,
    deliveryFee: order.deliveryFeeCents / 100,
    totalCents: order.totalCents,
    finalTotal: order.totalCents / 100,
    promoCode: order.promoCode,
    discountPercent: order.discountPercent,
    deliveryDate: order.deliveryDate.toISOString().slice(0, 10),
    delivery: {
      fullName: order.fullName,
      phone: order.phone,
      city: order.city,
      street: order.street,
      building: order.building,
      apartment: order.apartment,
    },
    createdAt: order.createdAt,
    cancelledAt: order.cancelledAt,
  };
}

export function presentAdminOrder(order: OrderWithUser) {
  return { ...presentOrder(order), user: order.user };
}