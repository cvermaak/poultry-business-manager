import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({condition:undefined as any,rows:[{status:'draft',dueDate:null,balanceDue:'12',inclusiveTotal:'12',feedOrderId:null},{status:'draft',dueDate:null,balanceDue:'999',inclusiveTotal:'999',feedOrderId:44}]}));
vi.mock('drizzle-orm/mysql2',()=>({drizzle:()=>({select:()=>({from:()=>({where:(condition:any)=>{state.condition=condition;return condition?state.rows.filter(row=>row.feedOrderId===null):state.rows;}})})})}));
import {MySqlDialect} from 'drizzle-orm/mysql-core';import {getCustomerInvoiceAgingSummary} from './db';
beforeEach(()=>{vi.stubEnv('DATABASE_URL','mysql://blocked.invalid/fixture');state.condition=undefined;});afterEach(()=>vi.unstubAllEnvs());
describe('Actual Customer aging helper excludes Feed invoices only when required',()=>{
 it('puts the stored Feed relationship exclusion in the database query before aggregation',async()=>{const result=await getCustomerInvoiceAgingSummary(true);const query=new MySqlDialect().sqlToQuery(state.condition);expect(query.sql).toMatch(/feed_order_id.*is null/i);expect(result.draft).toBe(1);expect(result.totalOutstanding).toBe(12);expect(result.totalOverdue).toBe(0);});
 it('keeps the original mixed totals when Feed View is allowed/default',async()=>{const result=await getCustomerInvoiceAgingSummary(false);expect(state.condition).toBeUndefined();expect(result.draft).toBe(2);expect(result.totalOutstanding).toBe(12+999);});
});
