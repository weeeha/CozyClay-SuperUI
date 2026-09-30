#!/usr/bin/env node
import { readFileSync } from "node:fs"

/** Contrast gate for the :root token layer, ported from the Minimal Design
 *  System (scripts/audit-contrast.mjs). It resolves var() chains in
 *  src/styles.css, measures every text token against every opaque surface it
 *  sits on, plus the label tokens against the fills they label, and fails
 *  below WCAG AA 4.5:1. Translucent tokens (hairlines, washes) are not text
 *  and are out of scope. */
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
const start = css.search(/^:root \{/m)
const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start))
const tokens = {}
for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].split("/*")[0].trim()

function hex(value, seen = 0) {
	if (!value || seen > 12) return null
	const ref = value.match(/^var\((--[\w-]+)\)$/)
	if (ref) return hex(tokens[ref[1]], seen + 1)
	const h = value.match(/^#([0-9a-fA-F]{6})$/)
	return h ? `#${h[1].toLowerCase()}` : null
}

function luminance(h) {
	const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
		.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const ratio = (a, b) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return (hi + 0.05) / (lo + 0.05)
}

const TEXT = ["--fg", "--muted", "--muted2", "--cyan", "--warn", "--success", "--danger"]
const SURFACES = ["--bg", "--panel", "--card"]
const LABELS = [["--on-accent", "--accent"], ["--on-accent", "--accent-2"]]
const pairs = [...TEXT.flatMap((t) => SURFACES.map((s) => [t, s])), ...LABELS]

let failures = 0
const rows = []
for (const [fg, bg] of pairs) {
	const a = hex(tokens[fg])
	const b = hex(tokens[bg])
	if (!a || !b) {
		failures++
		rows.push([0, `unresolved  ${fg} on ${bg} (need an opaque #rrggbb)`])
		continue
	}
	const r = ratio(a, b)
	if (r < 4.5) failures++
	rows.push([r, `${r.toFixed(2).padStart(6)}:1  ${r < 4.5 ? "FAIL" : "ok  "}  ${fg.padEnd(12)} ${a}  on  ${bg.padEnd(12)} ${b}`])
}
for (const [, line] of rows.sort((x, y) => x[0] - y[0])) console.log(line)
if (failures) {
	console.error(`\naudit:contrast - ${failures} pair(s) under 4.5:1.`)
	process.exit(1)
}
console.log(`\naudit:contrast - ${pairs.length} pair(s) at or above 4.5:1.`)
