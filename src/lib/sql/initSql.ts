import type { SqlJsStatic } from "sql.js";

export async function loadSql(): Promise<SqlJsStatic> {
  const sqlModule = await import("sql.js");

  const initSqlJs =
    sqlModule.default ?? sqlModule;

  if (typeof initSqlJs !== "function") {
    throw new Error("sql.js initializer is not a function");
  }

  return initSqlJs({
    locateFile: (file: string) =>
      `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`,
  });
}