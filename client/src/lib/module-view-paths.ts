export type ModuleViewFlags={customers:boolean;suppliers:boolean;feed_management:boolean};
export function moduleScopeForPath(path:string):keyof ModuleViewFlags|undefined{
 const clean=path.split(/[?#]/,1)[0];
 if(clean==='/customers'||clean.startsWith('/customers/'))return 'customers';
 if(clean==='/suppliers'||clean.startsWith('/suppliers/'))return 'suppliers';
 if(['/feed-management','/feed-orders','/invoicing/feed-invoices','/invoicing/mill-invoices'].some(prefix=>clean===prefix||clean.startsWith(prefix+'/')))return 'feed_management';
 return undefined;
}
export function canViewModulePath(path:string,access:ModuleViewFlags):boolean{const scope=moduleScopeForPath(path);return scope===undefined||access[scope]===true;}
