import {z} from 'zod';
import {router,protectedProcedure} from './_core/trpc';
import {authorizeBusinessAction,getBusinessPermissionService,businessPermissionServiceErrorCode} from './business-permission-service';
import {authorizeSupplierAction} from './supplier-permission-service';
import {BUSINESS_PERMISSION_DEFINITIONS} from '../shared/business-permission-definitions';
import {TRPCError} from '@trpc/server';

/** Fresh role/policy checks are made by the existing services; browser role and
 * viewerId are not authorization inputs. Failures are never treated as defaults. */
async function check(run:()=>Promise<void>){try{await run();return true;}catch(error){if(error instanceof TRPCError&&error.code==='FORBIDDEN')return false;if(businessPermissionServiceErrorCode(error)==='PERMISSION_DENIED')return false;throw error;}}
export async function resolveModuleViewAccess(actorId:number){
 const customers=await check(async()=>{await getBusinessPermissionService('customers').authorize(actorId,BUSINESS_PERMISSION_DEFINITIONS.customers.actions.view);});
 const suppliers=await check(async()=>{await authorizeSupplierAction(actorId,'list',undefined);await authorizeSupplierAction(actorId,'getById',{id:1});});
 const feed_management=await check(async()=>{await getBusinessPermissionService('feed_management').authorize(actorId,BUSINESS_PERMISSION_DEFINITIONS.feed_management.actions.view);});
 return {viewerId:actorId,customers,suppliers,feed_management};
}
export const moduleViewAccessRouter=router({get:protectedProcedure.input(z.object({viewerId:z.number().int().positive()})).query(async({ctx,input})=>{
 if(input.viewerId!==ctx.user.id)throw new TRPCError({code:'FORBIDDEN',message:'Access can only be checked for the signed-in user.'});
 return resolveModuleViewAccess(ctx.user.id);
})});
