// Synthetic fixture only: no driver, credentials, connections, or network.
import { type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { flockDailyRecords, userActivityLogs } from "../drizzle/schema";

export type SyntheticDailyRow = {
  id: number; flockId: number; mortality: number; culls: number | null;
  cullReason: string | null; notes?: string | null; feedConsumed?: string | null;
  [key: string]: unknown;
};

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

export function createDailyTestSource(initial: SyntheticDailyRow[] = []) {
  const dialect = new MySqlDialect();
  const rows = new Map(initial.map(row => [row.id, { ...row }]));
  const audits: Record<string, unknown>[] = [];
  const writes: Array<{ operation: string; patch?: Record<string, unknown>; sql?: string; params?: unknown[] }> = [];
  const locks: string[] = [];
  let tail = Promise.resolve();
  let pause: { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | undefined;
  let failNextWrite = false;
  let skipNextWrite = false;

  function matches(row: SyntheticDailyRow, expression: SQL) {
    const query = dialect.sqlToQuery(expression);
    let parameter = 0;
    const comparisons = Array.from(query.sql.matchAll(/`flock_daily_records`\.`(\w+)` (= \?|is null)/g));
    if (!comparisons.length) throw new Error("Synthetic source rejects unscoped conditions");
    return comparisons.map(match => {
      const actual = row[match[1]];
      return match[2] === "is null" ? actual === null : actual === query.params[parameter++];
    }).every(Boolean);
  }

  function insert(table: unknown) {
    return { values: async (data: Record<string, unknown>) => {
      if (table === userActivityLogs) {
        audits.push({ ...data });
        return [{ affectedRows: 1 }];
      }
      if (table !== flockDailyRecords) throw new Error("Unexpected table in synthetic source");
      const id = Math.max(0, ...Array.from(rows.keys())) + 1;
      rows.set(id, { ...data, id } as SyntheticDailyRow);
      writes.push({ operation: "insert", patch: { ...data } });
      return [{ insertId: id, affectedRows: 1 }];
    } };
  }

  const source = {
    rows, audits, writes, locks,
    pauseNextLockedRead() {
      pause = { entered: deferred(), release: deferred() };
      return pause;
    },
    failNextWrite() { failNextWrite = true; },
    skipNextWrite() { skipNextWrite = true; },
    insert,
    async transaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
      let release: (() => void) | undefined;
      let staged: Map<number, SyntheticDailyRow> | undefined;
      const pendingWrites: typeof writes = [];
      const tx = {
        select() {
          let expression: SQL;
          const chain = {
            from(table: unknown) {
              if (table !== flockDailyRecords) throw new Error("Unexpected read table");
              return chain;
            },
            where(value: SQL) { expression = value; return chain; },
            limit(value: number) { if (value !== 1) throw new Error("Expected single-row lookup"); return chain; },
            async for(mode: string) {
              if (mode !== "update") throw new Error("Expected update row lock");
              if (staged) return Array.from(staged.values()).filter(row => matches(row, expression)).slice(0, 1);
              const previous = tail;
              tail = new Promise<void>(done => { release = done; });
              await previous;
              locks.push(mode);
              staged = new Map(Array.from(rows).map(([id, row]) => [id, { ...row }]));
              const result = Array.from(staged.values()).filter(row => matches(row, expression)).slice(0, 1);
              const gate = pause;
              pause = undefined;
              if (gate) { gate.entered.resolve(); await gate.release.promise; }
              return result;
            },
          };
          return chain;
        },
        update(table: unknown) {
          if (table !== flockDailyRecords) throw new Error("Unexpected write table");
          return { set(patch: Record<string, unknown>) {
            return { async where(expression: SQL) {
              if (!staged) throw new Error("Write attempted without locked read");
              if (failNextWrite) { failNextWrite = false; throw new Error("Synthetic conditional write failed"); }
              if (skipNextWrite) { skipNextWrite = false; return [{ affectedRows: 0 }]; }
              const matching = Array.from(staged.values()).filter(row => matches(row, expression));
              for (const row of matching) staged.set(row.id, { ...row, ...patch });
              pendingWrites.push({ operation: "update", patch: { ...patch }, ...dialect.sqlToQuery(expression) });
              return [{ affectedRows: matching.length }];
            } };
          } };
        },
        delete(table: unknown) {
          if (table !== flockDailyRecords) throw new Error("Unexpected deletion table");
          return { async where(expression: SQL) {
            if (!staged) throw new Error("Delete attempted without locked read");
            if (skipNextWrite) { skipNextWrite = false; return [{ affectedRows: 0 }]; }
            const matching = Array.from(staged.values()).filter(row => matches(row, expression));
            for (const row of matching) staged.delete(row.id);
            pendingWrites.push({ operation: "delete", ...dialect.sqlToQuery(expression) });
            return [{ affectedRows: matching.length }];
          } };
        },
      };
      try {
        const result = await work(tx);
        if (staged) {
          rows.clear();
          staged.forEach((row, id) => rows.set(id, row));
        }
        writes.push(...pendingWrites);
        return result;
      } finally {
        release?.();
      }
    },
  };
  return source;
}
