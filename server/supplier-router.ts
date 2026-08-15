import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import * as supplierDb from "./supplier-management-db";

const optionalText = z.string().max(500).optional();

const supplierInput = z.object({
  name: z.string().trim().min(1, "Supplier name is required").max(200),
  contactPerson: optionalText,
  email: z.string().trim().email("Enter a valid email address").optional().or(z.literal("")),
  phone: optionalText,
  whatsapp: optionalText,
  preferredContactMethod: z.enum(["email", "whatsapp", "phone", "both"]).optional(),
  category: z.string().max(100).optional(),
  paymentTerms: z.string().max(100).optional(),
  taxNumber: z.string().max(100).optional(),
  bankName: z.string().max(200).optional(),
  bankAccountNumber: z.string().max(100).optional(),
  notes: z.string().max(10000).optional(),
});

export const supplierRouter = router({
  list: protectedProcedure
    .input(z.object({ category: z.string().optional(), isActive: z.boolean().optional() }).optional())
    .query(({ input }) => supplierDb.listSuppliers(input)),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => supplierDb.getSupplierById(input.id)),

  create: protectedProcedure
    .input(supplierInput)
    .mutation(({ input }) => supplierDb.createSupplier(input)),

  update: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }).merge(supplierInput.partial()).extend({ isActive: z.boolean().optional() }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return supplierDb.updateSupplier(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => supplierDb.deactivateSupplier(input.id)),
});
