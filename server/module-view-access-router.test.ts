import {beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({customers:true,suppliers:true,feed:false,unavailable:false,calls:[] as string[]}));
vi.mock('./business-permission-service',()=>({businessPermissionServiceErrorCode:(e:any)=>e?.message==='PERMISSION_DENIED'?'PERMISSION_DENIED':undefined,authorizeBusinessAction:async(id:number,scope:string,method:string)=>{state.calls.push(`${id}:${scope}:${method}`);if(state.unavailable)throw Error('UNAVAILABLE');if(!state.customers)throw Error('PERMISSION_DENIED');},getBusinessPermissionService:(scope:string)=>({authorize:async(id:number)=>{state.calls.push(`${id}:${scope}:view`);if(state.unavailable)throw Error('UNAVAILABLE');if(!(scope==='customers'?state.customers:state.feed))throw Error('PERMISSION_DENIED');}})}));
vi.mock('./supplier-permission-service',()=>({authorizeSupplierAction:async()=>{if(state.unavailable)throw Error('UNAVAILABLE');if(!state.suppliers){const e=new Error('PERMISSION_DENIED');throw e;}}}));
// Import the same class used by the real Supplier adapter so an intentional
// denial is distinguishable from a read failure without swallowing errors.
import {TRPCError} from '@trpc/server';
import {moduleViewAccessRouter,resolveModuleViewAccess} from './module-view-access-router';
function ctx(id=7){return {user:{id,role:'farm_manager',isActive:1},req:{headers:{}},res:{}} as any;}
beforeEach(()=>{state.customers=true;state.suppliers=true;state.feed=false;state.unavailable=false;state.calls=[];});
describe('Fresh server module-view endpoint',()=>{
 it('uses caller actor id and returns Farm Feed Block, without accepting a browser role',async()=>{const r=await moduleViewAccessRouter.createCaller(ctx()).get({viewerId:7});expect(r).toEqual({viewerId:7,customers:true,suppliers:true,feed_management:false});expect(state.calls).toEqual(['7:customers:view','7:feed_management:view']);});
 it('saved Customer Block is false on the very next request',async()=>{expect((await resolveModuleViewAccess(7)).customers).toBe(true);state.customers=false;expect((await resolveModuleViewAccess(7)).customers).toBe(false);});
 it('saved Feed Allow is read freshly rather than a permanent role-name ban',async()=>{state.feed=true;expect((await resolveModuleViewAccess(7)).feed_management).toBe(true);state.feed=false;expect((await resolveModuleViewAccess(7)).feed_management).toBe(false);});
 it('does not turn unavailable policy reads into inherited Allow',async()=>{state.unavailable=true;await expect(resolveModuleViewAccess(7)).rejects.toThrow('UNAVAILABLE');});
 it('does not check another user supplied by the client',async()=>{await expect(moduleViewAccessRouter.createCaller(ctx()).get({viewerId:8})).rejects.toMatchObject({code:'FORBIDDEN'});expect(state.calls).toEqual([]);});
 it('rejects unauthenticated direct callers',async()=>{await expect(moduleViewAccessRouter.createCaller({...ctx(),user:null}).get({viewerId:7})).rejects.toMatchObject({code:'UNAUTHORIZED'});});
});
