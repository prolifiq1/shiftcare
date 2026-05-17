import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

// Helpers in auth.ts / eligibility.ts that became async. Await their call
// sites (skipping their own definitions and already-awaited calls).
const FNS = [
  "findInvite",
  "findPasswordReset",
  "createPasswordReset",
  "createInvite",
  "createEmailVerification",
  "checkWorkerEligibility",
  "audit",
  "notify",
  "logAuth",
];

const files = execSync("grep -rlE '\\b(" + FNS.join("|") + ")\\(' src 2>/dev/null", {
  cwd: process.cwd(),
})
  .toString()
  .trim()
  .split("\n")
  .filter((f) => f && !f.endsWith("db.ts") && !f.endsWith(".d.ts"));

let total = 0;
for (const file of files) {
  let src = readFileSync(file, "utf8");
  const isDefFile = file.endsWith("lib/auth.ts") || file.endsWith("lib/eligibility.ts");
  let changed = 0;
  for (const fn of FNS) {
    // call as expression: not preceded by `await `, `function `, `.`, `async `
    const re = new RegExp(`(^|[^.\\w])(${fn})\\(`, "g");
    src = src.replace(re, (m, pre, name, offset) => {
      const ctxBefore = src.slice(Math.max(0, offset - 30), offset + pre.length);
      if (/await\s+$/.test(ctxBefore)) return m;
      if (/(function|async)\s+$/.test(ctxBefore)) return m; // definition
      // skip export function definitions
      const lineStart = src.lastIndexOf("\n", offset) + 1;
      const line = src.slice(lineStart, offset + 40);
      if (/export\s+(async\s+)?function\s/.test(line) && line.includes(`function ${name}`)) return m;
      changed++;
      return `${pre}await ${name}(`;
    });
  }
  if (changed && !isDefFile) {
    writeFileSync(file, src);
    total += changed;
    console.log(`${file}: ${changed}`);
  } else if (changed && isDefFile) {
    // Still apply inside def files for internal cross-calls (e.g. audit() in createInvite)
    writeFileSync(file, src);
    total += changed;
    console.log(`${file}: ${changed} (def file)`);
  }
}
console.log(`\nTotal helper calls awaited: ${total}`);
