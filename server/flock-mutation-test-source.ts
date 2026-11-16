// Synthetic-only injected executor. No pool, credentials, connections or network.
import { getTableColumns, getTableName, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
export function createFlockTestSource(initial: Record<string, any[]> = {}) {
  const dialect = new MySqlDialect();
  const source = {
    data: structuredClone(initial), attempts: [] as Array<{ operation: string; table: string; patch?: any }>, commits: 0, rollbacks: 0,
    failure: undefined as { operation: string; table: string } | undefined,
    fail(operation: string, table: string) { source.failure = { operation, table }; },
    async transaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
      const staged = structuredClone(source.data);
      const rows = (table: any) => staged[getTableName(table)] ?? (staged[getTableName(table)] = []);
      const check = (operation: string, table: any, patch?: any) => {
        const name = getTableName(table);
        source.attempts.push({ operation, table: name, patch });
        if (source.failure?.operation === operation && source.failure.table === name) throw new Error(`Synthetic ${operation} failure: ${name}`);
      };
      function matches(table: any, row: any, expression?: SQL) {
        if (!expression) return true;
        const query = dialect.sqlToQuery(expression);
        const aliases = Object.fromEntries(Object.entries(getTableColumns(table)).map(([key, col]: any) => [col.name, key]));
        let p = 0;
        const clauses = Array.from(query.sql.matchAll(/`[^`]+`\.`([^`]+)` (= \?|is null|in \([^)]*\))/g));
        if (!clauses.length) throw new Error(`Unsupported synthetic predicate: ${query.sql}`);
        const results = clauses.map(match => {
          const value = row[aliases[match[1]]];
          if (match[2] === "is null") return value == null;
          if (match[2] === "= ?") return value === query.params[p++];
          const count = (match[2].match(/\?/g) || []).length;
          const values = query.params.slice(p, p + count); p += count;
          return values.includes(value);
        });
        return results.every(Boolean);
      }
      const tx = {
        select() {
          let table: any, expression: SQL | undefined, count = Infinity;
          const resolve = () => { check("select", table); return rows(table).filter(row => matches(table, row, expression)).slice(0, count).map(row => ({ ...row })); };
          const chain = {
            from(value: any) { table = value; return chain; }, where(value: SQL) { expression = value; return chain; },
            limit(value: number) { count = value; return chain; }, for(mode: string) { if (mode !== "update") throw new Error("Unexpected lock"); return chain; },
            then(accept: any, reject: any) { return Promise.resolve().then(resolve).then(accept, reject); },
          };
          return chain;
        },
        insert(table: any) { return { async values(value: any) {
          check("insert", table, value);
          let insertId = 0;
          for (const data of Array.isArray(value) ? value : [value]) {
            insertId = Math.max(0, ...rows(table).map(row => row.id)) + 1;
            rows(table).push({ ...data, id: insertId });
          }
          return [{ insertId, affectedRows: 1 }];
        } }; },
        update(table: any) { return { set(patch: any) { return { async where(expression: SQL) {
          check("update", table, patch);
          for (const row of rows(table)) if (matches(table, row, expression)) Object.assign(row, patch);
          return [{ affectedRows: 1 }];
        } }; } }; },
        delete(table: any) { return { async where(expression: SQL) {
          check("delete", table);
          staged[getTableName(table)] = rows(table).filter(row => !matches(table, row, expression));
          return [{ affectedRows: 1 }];
        } }; },
      };
      try { const result = await work(tx); source.data = staged; source.commits++; return result; }
      catch (error) { source.rollbacks++; throw error; }
    },
  };
  return source;
}
