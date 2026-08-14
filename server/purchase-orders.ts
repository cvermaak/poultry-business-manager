export type PurchaseOrderStatus = "draft" | "sent" | "confirmed" | "delivered" | "cancelled";

export type PurchaseOrderLineInput = {
  description: string;
  quantity: number;
  unitPriceCents: number;
};

export function calculatePurchaseOrderLineTotal(item: PurchaseOrderLineInput): number {
  return Math.round(item.quantity * item.unitPriceCents);
}

export function calculatePurchaseOrderTotal(items: PurchaseOrderLineInput[]): number {
  return items.reduce((total, item) => total + calculatePurchaseOrderLineTotal(item), 0);
}

const ALLOWED_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["confirmed", "cancelled"],
  confirmed: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function canTransitionPurchaseOrder(
  from: PurchaseOrderStatus,
  to: PurchaseOrderStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
