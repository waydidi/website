// Minimal D1 contract used by the access-control layer.
export interface SecurityStatement {
 bind(...values: unknown[]): SecurityStatement;
 first<T = Record<string, unknown>>(): Promise<T | null>;
 run(): Promise<{meta:{changes:number}}>;
 all<T = Record<string, unknown>>(): Promise<{results:T[]}>;
}
export interface SecurityDatabase {
 prepare(sql:string):SecurityStatement;
 batch(statements:SecurityStatement[]):Promise<Array<{meta:{changes:number}}>>;
}
