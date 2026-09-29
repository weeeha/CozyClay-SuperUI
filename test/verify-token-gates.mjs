#!/usr/bin/env node
import { spawnSync } from "node:child_process";

// The studio's token layer is gated the way the Minimal Design System gates
// its own: literals ratchet down, contrast pairs hold AA. Both scripts live in
// tools/ so they can also run on their own (npm run check:tokens / audit:contrast).
let failures = 0;
for (const script of ["tools/check-tokens.mjs", "tools/audit-contrast.mjs"]) {
	const run = spawnSync(process.execPath, [script], { encoding: "utf8" });
	const ok = run.status === 0;
	console.log(`${ok ? "PASS" : "FAIL"} ${script}${ok ? "" : `\n${run.stdout}${run.stderr}`}`);
	if (!ok) failures += 1;
}
if (failures) process.exit(1);
console.log("all token gate checks PASS");
