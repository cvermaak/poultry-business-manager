import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierPermissionPolicyModel } from "../shared/supplier-permission-policy-model";
import { PREPARED_PERMISSION_CATALOGUE } from "../shared/role-permission-catalogue.generated";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({ actors: new Map<number, {id:number;role:string;isActive:0|1}>(),
  repository: undefined as any, list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("mysql2/promise", () => ({ createPool: vi.fn(() => ({})) }));
vi.mock("./business-permission-service", () => ({ canReadFinancialData: async (id:number) => state.actors.get(id)?.role !== 'farm_manager' }));
vi.mock("./supplier-permission-db", () => ({ createSupplierPermissionDb: () => ({
  resolveActor: async (id:number) => state.actors.get(id) ?? null,
  readPolicy: async (role:string) => ({ok:true, policy:state.repository.getPolicy(role)}),
  save: async (id:number, request:unknown) => {const a=state.actors.get(id);return state.repository.save(
    {actorId:id,authenticated:!!a,active:a?.isActive===1,role:a?.role},request);},
}) }));
vi.mock("./db", () => ({ listSuppliers:state.list,getSupplierById:state.get,createSupplier:state.create,
 updateSupplier:state.update,deleteSupplier:state.remove }));
import { appRouter } from "./routers";

function caller(id:number, role:string, isActive:0|1=1) {
  const user={id,role,isActive,openId:"synthetic",email:"synthetic@example.invalid",name:"Synthetic",loginMethod:"email",
    createdAt:new Date(0),updatedAt:new Date(0),lastSignedIn:new Date(0)};
  return appRouter.createCaller({user,req:{headers:{}},res:{}} as unknown as TrpcContext);
}
const profiles=["farm_manager","accountant","sales_staff","production_worker","chicken_house_operator"] as const;
const key="suppliers.records.view.list";
beforeEach(() => {
  vi.stubEnv("DATABASE_URL","mysql://synthetic:synthetic@blocked.invalid/offline_permissions");
  state.actors.clear();state.actors.set(1,{id:1,role:"admin",isActive:1});
  profiles.forEach((role,i)=>state.actors.set(i+2,{id:i+2,role,isActive:1}));
  state.repository=new SupplierPermissionPolicyModel({catalogue:PREPARED_PERMISSION_CATALOGUE,clock:()=>1794680000000});
  state.list.mockReset().mockResolvedValue([{id:17,name:"Synthetic supplier"}]);state.get.mockReset().mockResolvedValue({id:17,name:"Synthetic supplier"});
  state.create.mockReset().mockResolvedValue({id:18});state.update.mockReset().mockResolvedValue({id:17});state.remove.mockReset().mockResolvedValue({id:17});
});

describe("mounted app router Supplier role policy",()=>{
  it.each(profiles)("Admin can load the inherited %s policy",async role=>{
    const r=await caller(1,"admin").supplierPermissions.load(role);expect(r.ok).toBe(true);
    if(r.ok){expect(r.snapshot.role).toBe(role);expect(r.snapshot.version).toBe(0);expect(r.snapshot.grants).toEqual({});}
  });
  it.each(profiles)("%s cannot maintain policy profiles",async role=>{
    const id=profiles.indexOf(role)+2;await expect(caller(id,role).supplierPermissions.load("farm_manager")).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("uses the fresh stored Admin instead of a stale Admin session claim",async()=>{
    state.actors.set(1,{id:1,role:"sales_staff",isActive:1});const r=await caller(1,"admin").supplierPermissions.load("farm_manager");expect(r).toEqual({ok:false,code:"ADMIN_REQUIRED"});
  });
  it("rejects an inactive stored administrator",async()=>{
    state.actors.set(1,{id:1,role:"admin",isActive:0});expect(await caller(1,"admin").supplierPermissions.load("farm_manager")).toEqual({ok:false,code:"INACTIVE_ACTOR"});
  });
  it("protects the Admin profile from saves",async()=>{
    const r=await caller(1,"admin").supplierPermissions.save({role:"admin",catalogueRevision:PREPARED_PERMISSION_CATALOGUE.revision,expectedVersion:0,grants:{},reason:"Synthetic test"});expect(r).toEqual({ok:false,code:"ADMIN_PROTECTED"});
  });
  it("blocks the business helper immediately after an Admin revokes list",async()=>{
    const admin=caller(1,"admin");const r=await admin.supplierPermissions.save({role:"farm_manager",catalogueRevision:PREPARED_PERMISSION_CATALOGUE.revision,expectedVersion:0,grants:{[key]:false},reason:"Synthetic test"});expect(r.ok).toBe(true);
    await expect(caller(2,"farm_manager").suppliers.list()).rejects.toMatchObject({code:"FORBIDDEN"});expect(state.list).not.toHaveBeenCalled();
    expect(await caller(1,"admin").suppliers.list()).toHaveLength(1);
  });
  it("retains the native create normalization and typed result",async()=>{
    expect(await caller(2,"farm_manager").suppliers.create({name:"Synthetic",email:""})).toEqual({id:18});expect(state.create).toHaveBeenCalledWith({name:"Synthetic",email:undefined});
  });
  it("requires Delete as well as Edit for deactivation but not ordinary editing",async()=>{
    await caller(1,"admin").supplierPermissions.save({role:"farm_manager",catalogueRevision:PREPARED_PERMISSION_CATALOGUE.revision,expectedVersion:0,grants:{"suppliers.records.delete.delete":false},reason:"Synthetic test"});
    await expect(caller(2,"farm_manager").suppliers.update({id:17,isActive:false})).rejects.toMatchObject({code:"FORBIDDEN"});expect(state.update).not.toHaveBeenCalled();
    await caller(2,"farm_manager").suppliers.update({id:17,name:"Updated"});expect(state.update).toHaveBeenCalledWith(17,{name:"Updated",email:undefined});
  });
  it("preserves update empty-email normalization",async()=>{
    await caller(2,"farm_manager").suppliers.update({id:17,email:""});expect(state.update).toHaveBeenCalledWith(17,{email:null});
  });
  it("denies stale/missing/inactive users before any business helper",async()=>{
    state.actors.set(2,{id:2,role:"farm_manager",isActive:0});await expect(caller(2,"farm_manager").suppliers.list()).rejects.toMatchObject({code:"FORBIDDEN"});expect(state.list).not.toHaveBeenCalled();
  });
  it("preserves existing get and delete helper results",async()=>{
    expect(await caller(2,"farm_manager").suppliers.getById({id:17})).toEqual({id:17,name:"Synthetic supplier"});expect(await caller(2,"farm_manager").suppliers.delete({id:17})).toEqual({id:17});
  });
  it("returns a stale save conflict without publishing another change",async()=>{
    const request={role:"farm_manager",catalogueRevision:PREPARED_PERMISSION_CATALOGUE.revision,expectedVersion:0,grants:{[key]:false},reason:"Synthetic test"};await caller(1,"admin").supplierPermissions.save(request);
    expect(await caller(1,"admin").supplierPermissions.save(request)).toEqual({ok:false,code:"STALE_VERSION"});
  });
  it("denies unauthenticated policy reads before resolving a repository",async()=>{
    const c=appRouter.createCaller({user:null,req:{headers:{}},res:{}} as unknown as TrpcContext);await expect(c.supplierPermissions.load("farm_manager")).rejects.toMatchObject({code:"UNAUTHORIZED"});
  });
});
