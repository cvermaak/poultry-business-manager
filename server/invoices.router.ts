import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { customers } from "../drizzle/schema";
import { eq, asc } from "drizzle-orm";
import { getDb } from "./db";

export const invoiceRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        customerId: z.number(),
        catchSessionId: z.number(),
        processorId: z.number(),
        pricePerKgExcl: z.number().positive(),
        dueDate: z.date().optional(),
        vatPercentage: z.number().default(15),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Get next invoice number
      const invoiceNumber = await db.getNextInvoiceNumber();

      // Calculate due date (default to 30 days from now)
      const dueDate = input.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Create invoice
      const result = await db.createInvoice({
        invoiceNumber,
        customerId: input.customerId,
        catchSessionId: input.catchSessionId,
        processorId: input.processorId,
        invoiceDate: new Date(),
        dueDate,
        pricePerKgExcl: input.pricePerKgExcl,
        totalBirds: 0,
        totalWeight: 0,
        vatPercentage: input.vatPercentage,
        createdBy: ctx.user?.id,
      });

      return { success: true, invoiceId: result.insertId, invoiceNumber };
    }),

  list: protectedProcedure
    .input(
      z.object({
        customerId: z.number().optional(),
        status: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const invoices = await db.listInvoices(input.customerId, input.status);
      return invoices.slice(input.offset, input.offset + input.limit);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const invoice = await db.getInvoiceById(input.id);
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
      return invoice;
    }),

  generatePDF: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const invoice = await db.getInvoiceById(input.id);
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });

      return { success: true, pdfUrl: '/invoices/' + invoice.invoiceNumber + '.pdf' };
    }),
});

export const customerRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        companyName: z.string().optional(),
        vatNumber: z.string().optional(),
        registrationNumber: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        postalAddress: z.string().optional(),
        physicalAddress: z.string().optional(),
        paymentTerms: z.string().default('cash'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const customerDb = await getDb();
      if (!customerDb) throw new Error("Database not available");

      const customerNumber = 'CUST' + Date.now();

      const result = await customerDb.insert(customers).values({
        customerNumber,
        name: input.name,
        companyName: input.companyName,
        vatNumber: input.vatNumber,
        registrationNumber: input.registrationNumber,
        email: input.email,
        phone: input.phone,
        postalAddress: input.postalAddress,
        physicalAddress: input.physicalAddress,
        paymentTerms: input.paymentTerms,
        createdBy: ctx.user?.id,
      });

      return { success: true, customerId: (result as any)[0]?.insertId || (result as any).insertId };
    }),

  list: protectedProcedure
    .input(z.object({ isActive: z.boolean().default(true) }))
    .query(async ({ input }) => {
      const customerDb = await getDb();
      if (!customerDb) throw new Error("Database not available");

      return customerDb
        .select()
        .from(customers)
        .where(eq(customers.isActive, input.isActive ? 1 : 0))
        .orderBy(asc(customers.name));
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const customerDb = await getDb();
      if (!customerDb) throw new Error("Database not available");

      const customer = await customerDb
        .select()
        .from(customers)
        .where(eq(customers.id, input.id))
        .limit(1);

      if (!customer.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
      return customer[0];
    }),
});
