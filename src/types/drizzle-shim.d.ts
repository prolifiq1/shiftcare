// Type side of the better-sqlite3 -> Postgres compatibility shim defined in
// src/lib/db.ts. Adds async `.all()/.get()/.run()` to every drizzle
// QueryPromise so the existing query call sites keep type-checking.
import "drizzle-orm";

declare module "drizzle-orm" {
  interface QueryPromise<T> {
    all(): Promise<T>;
    get(): Promise<T extends (infer E)[] ? E | undefined : T | undefined>;
    run(): Promise<void>;
  }
}
