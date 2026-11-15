import { types as nodeTypes } from "node:util";
import { protectedProcedure as baseProtectedProcedure, adminProcedure as baseAdminProcedure } from './_core/trpc';
import { TRPCError } from '@trpc/server';
import { canReadFinancialData, getBusinessStoredActor } from './business-permission-service';
import { redactFinancialData } from './financial-data-boundary';
import { isFinancialDataKey } from '../shared/financial-data-policy';
import { financialProcedureMode, FINANCIAL_RAW_INPUT_BLOCKS } from '../shared/financial-procedure-policy';

function denied():never{throw new TRPCError({code:'FORBIDDEN',message:'Your role is not allowed to access financial data.'});}
const FARM_SENSITIVE_FINANCIAL_ACTIONS=new Set(['invoices.markAsSent','invoices.recordPayment','invoices.cancel','invoices.createMillInvoice','invoices.recordMillInvoicePayment','invoices.postMillInvoiceToPayables','feedOrders.recordMillInvoice','feedOrders.markMillInvoicePaid']);
const OPAQUE_OUTPUT_KEYS=new Set(['notes','description','descriptions','actionNotes','details','paymentTerms','ingredients','longDescription']);
/** Unknown user text is not a safe monetary projection. Monetary data remains
 * removed recursively; only structured operational fields are returned. */
export function projectNonFinancialData(input:unknown):unknown{
 const safe=redactFinancialData(input);
 function project(value:unknown):unknown{
  if(Array.isArray(value))return value.filter(v=>!(v&&typeof v==='object'&&(v as Record<string,unknown>).type==='mill_invoice_due')).map(project);
  if(value&&typeof value==='object'&&!(value instanceof Date)){
   const out:Record<string,unknown>=Object.create(null);
   for(const key of Object.keys(value)){
    if(OPAQUE_OUTPUT_KEYS.has(key))continue;
    const v=(value as Record<string,unknown>)[key];
    if(key==='status'&&v==='invoiced')continue;
    out[key]=project(v);
   }
   return out;
  }
  return value;
 }
 return project(safe);
}
export function assertNonFinancialInput(path:string,input:unknown):void{
 const banned=FINANCIAL_RAW_INPUT_BLOCKS[path]??[];let budget=100000;
 function inspect(v:unknown,depth:number):void{
  if(--budget<0||depth>20)denied();
  if(v===null||v===undefined||typeof v!=='object')return;
  if(nodeTypes.isProxy(v))denied();
  if(nodeTypes.isDate(v)){if(Object.getPrototypeOf(v)!==Date.prototype||Reflect.ownKeys(v).length!==0||!Number.isFinite(Date.prototype.getTime.call(v)))denied();return;}
  if(Array.isArray(v)){for(const item of v)inspect(item,depth+1);return;}
  const proto=Object.getPrototypeOf(v);if(proto!==Object.prototype&&proto!==null)denied();
  for(const key of Reflect.ownKeys(v)){
   if(typeof key!=='string')denied();const d=Object.getOwnPropertyDescriptor(v,key);if(!d||!('value'in d))denied();
   if(isFinancialDataKey(key)||banned.includes(key))denied();
   if((key==='status'&&d.value==='invoiced')||(key==='actionNotes'&&typeof d.value==='string'&&d.value.trim()))denied();
   inspect(d.value,depth+1);
  }
 }
 try{inspect(input,0);}catch{denied();}
}
const restriction=baseProtectedProcedure.use(async({ctx,path,type,getRawInput,next})=>{
 const mode=financialProcedureMode(path);
 // Financial View is not permission to post/pay; existing role and business controls remain.
 if(type==='mutation'&&FARM_SENSITIVE_FINANCIAL_ACTIONS.has(path)&&(await getBusinessStoredActor(ctx.user.id)).role==='farm_manager')denied();
 if(mode==='none')return next();
 const allowed=await canReadFinancialData(ctx.user.id);
 if(!allowed){if(mode==='deny')denied();if(type==='mutation')assertNonFinancialInput(path,await getRawInput());}
 const result=await next();
 if(!allowed&&result.ok)return {...result,data:projectNonFinancialData(result.data)};
 if(!allowed&&!result.ok)return {...result,error:new TRPCError({code:result.error.code,message:'The operational request could not be completed safely.'})};
 return result;
});
export const financialProtectedProcedure=restriction;
export const financialAdminProcedure=baseAdminProcedure.use(async({ctx,path,type,getRawInput,next})=>{
 if(!ctx.user)return denied();const mode=financialProcedureMode(path);if(mode==='none')return next();
 const allowed=await canReadFinancialData(ctx.user.id);if(!allowed){if(mode==='deny')denied();if(type==='mutation')assertNonFinancialInput(path,await getRawInput());}
 const result=await next();if(!allowed&&!result.ok)return {...result,error:new TRPCError({code:result.error.code,message:'The operational request could not be completed safely.'})};return !allowed&&result.ok?{...result,data:projectNonFinancialData(result.data)}:result;
});
