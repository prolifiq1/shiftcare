import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const files = execSync("grep -rlE '\\.(all|get|run)\\(\\)' src 2>/dev/null", {
  cwd: process.cwd(),
})
  .toString()
  .trim()
  .split("\n")
  .filter((f) => f && !f.endsWith("db.ts") && !f.endsWith("schema.ts") && !f.endsWith(".d.ts"));

// Match a db execution chain: db.<verb>( ... ) ... .all()/.get()/.run()
// Lazy up to the FIRST terminator. No nested db.* chains exist in this codebase.
const re = /db\s*\.\s*(?:select|insert|update|delete)\b[\s\S]*?\.(?:all|get|run)\(\)/g;

let total = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  let changed = 0;
  const out = src.replace(re, (m, offset) => {
    // Skip if already awaited: look back for `await ` or `(await `
    const before = src.slice(Math.max(0, offset - 7), offset);
    if (/await\s*\($/.test(src.slice(Math.max(0, offset - 8), offset)) || /await\s$/.test(before)) {
      return m;
    }
    changed++;
    return `(await ${m})`;
  });
  if (changed) {
    writeFileSync(file, out);
    total += changed;
    console.log(`${file}: ${changed}`);
  }
}
console.log(`\nTotal sites wrapped: ${total}`);
