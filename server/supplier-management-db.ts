import { and, asc, desc, eq } from "drizzle-orm";
import { suppliers } from "../drizzle/schema";
import { getDb } from "./db";

export type SupplierContactMethod = "email" | "whatsapp" | "phone" | "both";

export type SupplierInput = {
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  preferredContactMethod?: SupplierContactMethod;
  category?: string;
  paymentTerms?: string;
  taxNumber?: string;
  bankName?: string;
  bankAccountNumber?: string;
  notes?: string;
};

export async function listSuppliers(filters?: { category?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [
    filters?.category ? eq(suppliers.category, filters.category) : undefined,
    filters?.isActive === undefined ? undefined : eq(suppliers.isActive, filters.isActive),
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

  return db
    .select()
    .from(suppliers)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(suppliers.name));
}

export async function getSupplierById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
  return result[0];
}

export async function getNextSupplierNumber(): Promise<string> {
  const db = await getDb();
  if (!db) return "SUP-0001";

  const result = await db
    .select({ supplierNumber: suppliers.supplierNumber })
    .from(suppliers)
    .orderBy(desc(suppliers.id))
    .limit(1);

  const lastNumber = result[0]?.supplierNumber ?? "";
  const match = lastNumber.match(/(\d+)$/);
  const next = match ? Number.parseInt(match[1], 10) + 1 : 1;
  return `SUP-${String(next).padStart(4, "0")}`;
}

export async function createSupplier(data: SupplierInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const supplierNumber = await getNextSupplierNumber();
  const result = await db.insert(suppliers).values({
    supplierNumber,
    name: data.name.trim(),
    contactPerson: data.contactPerson?.trim() || null,
    email: data.email?.trim() || null,
    phone: data.phone?.trim() || null,
    whatsapp: data.whatsapp?.trim() || null,
    preferredContactMethod: data.preferredContactMethod ?? "email",
    category: data.category?.trim() || null,
    paymentTerms: data.paymentTerms?.trim() || "cash",
    taxNumber: data.taxNumber?.trim() || null,
    bankName: data.bankName?.trim() || null,
    bankAccountNumber: data.bankAccountNumber?.trim() || null,
    notes: data.notes?.trim() || null,
    isActive: 1,
  });

  return { id: Number(result[0].insertId), supplierNumber };
}

export async function updateSupplier(id: number, data: Partial<SupplierInput & { isActive: boolean }>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(suppliers)
    .set({
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.contactPerson !== undefined && { contactPerson: data.contactPerson?.trim() || null }),
      ...(data.email !== undefined && { email: data.email?.trim() || null }),
      ...(data.phone !== undefined && { phone: data.phone?.trim() || null }),
      ...(data.whatsapp !== undefined && { whatsapp: data.whatsapp?.trim() || null }),
      ...(data.preferredContactMethod !== undefined && { preferredContactMethod: data.preferredContactMethod }),
      ...(data.category !== undefined && { category: data.category?.trim() || null }),
      ...(data.paymentTerms !== undefined && { paymentTerms: data.paymentTerms?.trim() || null }),
      ...(data.taxNumber !== undefined && { taxNumber: data.taxNumber?.trim() || null }),
      ...(data.bankName !== undefined && { bankName: data.bankName?.trim() || null }),
      ...(data.bankAccountNumber !== undefined && { bankAccountNumber: data.bankAccountNumber?.trim() || null }),
      ...(data.notes !== undefined && { notes: data.notes?.trim() || null }),
      ...(data.isActive !== undefined && { isActive: data.isActive ? 1 : 0 }),
    })
    .where(eq(suppliers.id, id));

  return true;
}

export async function deactivateSupplier(id: number) {
  return updateSupplier(id, { isActive: false });
}
