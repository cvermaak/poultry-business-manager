import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({user:{id:7,role:'farm_manager'} as any,error:false,updated:2000,data:{viewerId:7,customers:false,suppliers:false,feed_management:false} as any,reset:vi.fn()}));
vi.mock('@/_core/hooks/useAuth',()=>({useAuth:()=>({user:state.user,loading:false})}));
vi.mock('@/lib/trpc',()=>({trpc:{useUtils:()=>({customers:{list:{reset:state.reset}},suppliers:{list:{reset:state.reset}}}),moduleViewAccess:{get:{useQuery:()=>({isError:state.error,data:state.data,dataUpdatedAt:state.updated})}}}}));
import {ModuleViewAccessGuard,type ModuleViewScope} from '../hooks/useModuleViewAccess';
beforeEach(()=>{vi.spyOn(Date,'now').mockReturnValue(1000);state.user={id:7,role:'farm_manager'};state.error=false;state.updated=2000;state.data={viewerId:7,customers:false,suppliers:false,feed_management:false};});
afterEach(()=>vi.restoreAllMocks());
describe('Actual module guard: protected record-page hooks never mount until a fresh View Allow',()=>{
 for(const scope of ['customers','suppliers','feed_management'] as ModuleViewScope[]){
  it(`${scope}: saved Block removes the whole page, not only menu`,()=>{let mounts=0;function SecretPage(){mounts++;return <p>PRIVATE RECORD</p>;}const html=renderToStaticMarkup(<ModuleViewAccessGuard scope={scope}><SecretPage/></ModuleViewAccessGuard>);expect(html).toContain('Module access restricted');expect(html).not.toContain('PRIVATE RECORD');expect(mounts).toBe(0);});
  it(`${scope}: fresh Allow retains original page`,()=>{state.data[scope]=true;expect(renderToStaticMarkup(<ModuleViewAccessGuard scope={scope}><p>OPERATIONS</p></ModuleViewAccessGuard>)).toContain('OPERATIONS');});
  it(`${scope}: retained Allow data plus failed refetch cannot leak cached records`,()=>{state.data[scope]=true;state.error=true;expect(renderToStaticMarkup(<ModuleViewAccessGuard scope={scope}><p>PRIVATE RECORD</p></ModuleViewAccessGuard>)).not.toContain('PRIVATE RECORD');});
  it(`${scope}: wrong viewer and pre-mount cached Allow remain unmounted`,()=>{state.data[scope]=true;state.data.viewerId=8;expect(renderToStaticMarkup(<ModuleViewAccessGuard scope={scope}><p>PRIVATE RECORD</p></ModuleViewAccessGuard>)).not.toContain('PRIVATE RECORD');state.data.viewerId=7;state.updated=999;const html=renderToStaticMarkup(<ModuleViewAccessGuard scope={scope}><p>PRIVATE RECORD</p></ModuleViewAccessGuard>);expect(html).toContain('Checking module access');expect(html).not.toContain('PRIVATE RECORD');});
 }
 it('signed-out viewer cannot mount despite retained permission data',()=>{state.user=null;state.data.customers=true;expect(renderToStaticMarkup(<ModuleViewAccessGuard scope="customers"><p>PRIVATE RECORD</p></ModuleViewAccessGuard>)).not.toContain('PRIVATE RECORD');});
});
