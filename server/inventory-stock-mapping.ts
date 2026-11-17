import { sql } from "drizzle-orm";
import { decimal, int, mysqlTable, timestamp } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { inventoryStock as camelInventoryStock } from "../drizzle/schema";

// Static application aliases only. Never synthesize identifiers from metadata,
// mutate the schema registry, or rename physical columns.
const snakeInventoryStock = mysqlTable("inventory_stock", {
  id: int("id").autoincrement().notNull(),
  itemId: int("item_id").notNull(),
  locationId: int("location_id").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).default("0").notNull(),
  lastUpdated: timestamp("last_updated", { mode: "string" }).defaultNow().onUpdateNow(),
  updatedBy: int("updated_by"),
});

type MetadataRow = {
  columnName: string;
  dataType: string;
  columnType: string;
  isNullable: string;
  numericPrecision: number | null;
  numericScale: number | null;
  datetimePrecision: number | null;
  generationExpression: string | null;
};

/** Closed, uncached gate: each operation uses its supplied DB/session's metadata.
 * No row-data cache, failed-gate cache, environment override, or circular DB import.
 * lastUpdated accepts Dev's nullable timestamp and Manus's NOT NULL timestamp.
 */
export async function resolveInventoryStock(db: Pick<MySql2Database<any>, "execute">) {
  const result = await db.execute(sql`
    SELECT COLUMN_NAME AS columnName, DATA_TYPE AS dataType,
           COLUMN_TYPE AS columnType, IS_NULLABLE AS isNullable,
           NUMERIC_PRECISION AS numericPrecision, NUMERIC_SCALE AS numericScale,
           DATETIME_PRECISION AS datetimePrecision,
           GENERATION_EXPRESSION AS generationExpression
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_stock'
    ORDER BY ORDINAL_POSITION
  `);
  const rows = result[0] as unknown as MetadataRow[];
  const reject = (): never => {
    throw new Error("Unsupported inventory_stock metadata: expected exact snake6 or camel6 columns, types and nullability");
  };
  if (!Array.isArray(rows) || rows.length !== 6) return reject();
  const names = rows.map(r => r.columnName);
  if (new Set(names).size !== 6) return reject();
  const snake = ["id", "item_id", "location_id", "quantity", "last_updated", "updated_by"];
  const camel = ["id", "itemId", "locationId", "quantity", "lastUpdated", "updatedBy"];
  const matches = (expected: string[]) => expected.every(name => names.includes(name));
  const isSnake = matches(snake);
  const isCamel = matches(camel);
  if (isSnake === isCamel) return reject();
  const expected = isSnake ? snake : camel;
  for (const row of rows) {
    const position = expected.indexOf(row.columnName);
    if (position < 0 || (row.generationExpression ?? "") !== "") return reject();
    const nullability = position === 4 ? ["YES", "NO"] : [position === 5 ? "YES" : "NO"];
    if (!nullability.includes(row.isNullable)) return reject();
    if (position === 3) {
      if (row.dataType !== "decimal" || row.columnType !== "decimal(10,2)" ||
          Number(row.numericPrecision) !== 10 || Number(row.numericScale) !== 2) return reject();
    } else if (position === 4) {
      if (row.dataType !== "timestamp" || row.columnType !== "timestamp" ||
          row.datetimePrecision === null || Number(row.datetimePrecision) !== 0) return reject();
    } else if (row.dataType !== "int" || !/^int(?:\(11\))?$/.test(row.columnType)) {
      return reject();
    }
  }
  return isSnake ? snakeInventoryStock : camelInventoryStock;
}
