import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Loads a module of the API source (artifacts/api-server/src/…) at run time,
 * so scripts reuse the project's business code (allocation engine, PDF
 * engine) without making it part of this package's TypeScript build.
 */
export function apiLib<T = any>(relative: string): Promise<T> {
  const file = path.resolve(process.cwd(), "../artifacts/api-server/src", relative);
  return import(pathToFileURL(file).href) as Promise<T>;
}
