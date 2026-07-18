# AFGRO Poultry Manager — Railway Sync Package
**Date:** 2026-07-17  
**Covers changes since:** Additive Inventory Integration (commit `70464b4`)  
**Includes:** Invoicing Extension Module, Invoice Decimal Columns, Feed Order Invoice Link, Units of Measure (UoM) System

---

## Step 1 — Apply SQL Migrations

Run `RAILWAY_SQL_MIGRATION.sql` against your Railway MySQL database.  
All statements use `IF NOT EXISTS` / `INSERT IGNORE` so they are **safe to run multiple times**.

```bash
# Via Railway CLI
railway run mysql < RAILWAY_SQL_MIGRATION.sql

# Or paste into Railway's database console
```

**What the SQL does:**
| Migration | Change |
|---|---|
| 0006 | Creates `mill_invoices` table for mill-to-AFGRO invoice tracking |
| 0007 | Changes `invoices` monetary columns from `int` to `decimal(15,2)` |
| 0008 | Adds `feed_order_id` FK column to `invoices` table |
| 0009 | Creates `unit_of_measures` and `item_unit_conversions` tables; adds `base_uom_code`, `purchase_uom_code`, `issue_uom_code` to `inventory_items`; adds `uom_code`, `quantity_in_base_unit` to `inventory_transactions` |
| 0010 | Timestamp default fix (handled inline in 0009 above) |
| Seed | Inserts 18 standard UoMs (weight, volume, count, packaging) |

---

## Step 2 — Replace Source Files

Copy the following files from this package into your GitHub repository, replacing the existing versions:

### Server
- `server/db.ts` — new `createSupplier`, `updateSupplier`, `deleteSupplier`, `getNextSupplierNumber` helpers; UoM helpers
- `server/db-inventory.ts` — UoM conversion helpers (`listUnitsOfMeasure`, `listItemUnitConversions`, `saveItemUnitConversion`, `deleteItemUnitConversion`, `convertQuantity`)
- `server/inventory-router.ts` — UoM CRUD procedures (`listUoms`, `getItemConversions`, `saveItemConversion`, `deleteItemConversion`)
- `server/routers.ts` — Invoicing Extension procedures, supplier CRUD stubs, UoM procedures wired
- `server/uom.test.ts` — 6 vitest tests for UoM CRUD helpers

### Client
- `client/src/App.tsx` — new routes for FeedInvoices, MillInvoices, AdditiveInventorySettings
- `client/src/components/DashboardLayout.tsx` — new nav items (Feed Invoices, Mill Invoices, Additive Settings)
- `client/src/components/InvoiceAgingWidget.tsx` — invoice aging dashboard widget
- `client/src/pages/FeedInvoices.tsx` — Feed Invoices page (create, view, pay, PDF, send, cancel)
- `client/src/pages/FeedOrderDetail.tsx` — Feed Order Detail with invoice status badge
- `client/src/pages/FeedOrders.tsx` — Feed Orders list with Create Order dialog (stock check panel)
- `client/src/pages/Home.tsx` — InvoiceAgingWidget added to dashboard
- `client/src/pages/Inventory.tsx` — Full UoM frontend (dropdowns, conversion manager, Units tab, UoM in transactions)
- `client/src/pages/Invoices.tsx` — Invoice list with Discount % column, correct decimal formatting
- `client/src/pages/MillInvoices.tsx` — Mill Invoices page (list, view/detail dialog, record payment)

### Schema
- `drizzle/schema.ts` — `millInvoices` table, `invoices` decimal columns, `feedOrderId` on invoices, `unitOfMeasures`, `itemUnitConversions` tables, UoM columns on inventory tables

---

## Step 3 — Build & Deploy

```bash
# Install dependencies (if any new packages were added)
npm install

# Build
npm run build

# Deploy to Railway
git add -A
git commit -m "Sync: Invoicing Extension + UoM system (2026-07-17)"
git push
```

---

## Verification Checklist

After deployment, verify the following in your Railway app:

- [ ] `unit_of_measures` table has 18 rows
- [ ] Inventory → Items tab: Base/Purchase/Issue UoM dropdowns visible in create/edit form
- [ ] Inventory → Items tab: Ruler icon button opens Unit Conversion manager
- [ ] Inventory → Units tab: Shows all 18 UoMs
- [ ] Inventory → Transaction dialog: UoM dropdown visible next to quantity
- [ ] Sales → Feed Invoices: Page loads, create/view/pay/PDF all work
- [ ] Sales → Mill Invoices: Page loads, view/detail dialog works
- [ ] Dashboard: Invoice Aging Widget visible
- [ ] Feed Orders: Create Order dialog shows stock check panel for additives

---

## Rollback

If any migration fails, the `IF NOT EXISTS` / `INSERT IGNORE` guards mean partial runs are safe.  
To rollback new tables:
```sql
DROP TABLE IF EXISTS mill_invoices;
DROP TABLE IF EXISTS item_unit_conversions;
DROP TABLE IF EXISTS unit_of_measures;
ALTER TABLE inventory_items DROP COLUMN IF EXISTS base_uom_code, DROP COLUMN IF EXISTS purchase_uom_code, DROP COLUMN IF EXISTS issue_uom_code;
ALTER TABLE inventory_transactions DROP COLUMN IF EXISTS uom_code, DROP COLUMN IF EXISTS quantity_in_base_unit;
ALTER TABLE invoices DROP COLUMN IF EXISTS feed_order_id;
```
