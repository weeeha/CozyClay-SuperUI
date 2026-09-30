#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"

/** Token gate for the studio stylesheets, ported from the Minimal Design
 *  System (scripts/check-tokens.mjs), itself ported from Super-AI-Components.
 *  Same shape: strict rules fail on any hit, ratchet rules fail only on values
 *  not already recorded in token-baseline.json, and the escape hatch covers
 *  one line with a mandatory reason. CozyClay styles its chrome in plain CSS,
 *  so the scope is stylesheets rather than components, and the token layer
 *  itself (custom property definitions) is exempt: that is where values live.
 *
 *  Usage: node tools/check-tokens.mjs            check
 *         node tools/check-tokens.mjs --baseline  rewrite the ratchet baseline */
const FILES = ["src/styles.css", "src/workflow/agent-panel.css", "src/ardy/physics-panel.css"]
const BASELINE_PATH = new URL("./token-baseline.json", import.meta.url)

const PATTERNS = [
	// Radii come from the --radius-* rungs; 0 and 50% are geometry, not scale.
	{ re: /border(?:-[a-z]+)*-radius\s*:[^;]*\b\d+(?:\.\d+)?px/g, why: "off-scale radius" },
	// Motion and effect bans from unslop (Phase 1, rules 1 and 6).
	{ re: /transition\s*:\s*all\b/g, why: "transition: all" },
	{ re: /backdrop-filter\s*:\s*blur/g, why: "backdrop blur (glass)" },
	{ re: /(?:linear|radial|conic)-gradient\(/g, why: "gradient", ratchet: true },
	// Colour, type and duration literals: existing sites are recorded, new ones fail.
	{ re: /#[0-9a-fA-F]{3,8}\b/g, why: "raw hex color", ratchet: true },
	{ re: /\b(?:rgba?|hsla?|oklch)\([^)]*\)/g, why: "raw color function", ratchet: true },
	{ re: /font-size\s*:\s*[\d.]+px/g, why: "px font size", ratchet: true },
	{ re: /\b\d*\.?\d+m?s\b(?=[^;]*(?:ease|linear|cubic|steps|;))/g, why: "literal duration", ratchet: true },
]

/** Deliberately noisy: the reason is mandatory and it only covers the next line.
 *      /* token-gate-allow: <why this cannot use a token> *\/ */
const ALLOW = /token-gate-allow:\s*\S/
const DEFINITION = /^\s*--[\w-]+\s*:/

function readBaseline() {
	try {
		return JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
	} catch {
		return {}
	}
}

/** Returns [{ line, why, values, ratchet }] for one stylesheet's text. */
export function scan(text) {
	const lines = text.split("\n")
	const hits = []
	lines.forEach((line, i) => {
		if (DEFINITION.test(line)) return
		if (i > 0 && ALLOW.test(lines[i - 1])) return
		const code = line.replace(/\/\*.*?\*\//g, "")
		for (const { re, why, ratchet } of PATTERNS) {
			const found = code.match(re)
			re.lastIndex = 0
			if (found) hits.push({ line: i + 1, why, values: found, ratchet: Boolean(ratchet) })
		}
	})
	return hits
}

function tally(hits) {
	const counts = {}
	for (const hit of hits.filter((h) => h.ratchet)) {
		for (const value of hit.values) {
			const key = `${hit.why}|${value.toLowerCase()}`
			counts[key] = (counts[key] ?? 0) + 1
		}
	}
	return counts
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isCli) {
	const writeBaseline = process.argv.includes("--baseline")
	const baseline = readBaseline()
	const next = {}
	let violations = 0
	let carried = 0
	for (const file of FILES) {
		const hits = scan(readFileSync(file, "utf8"))
		const counts = tally(hits)
		next[file] = counts
		for (const hit of hits.filter((h) => !h.ratchet)) {
			violations++
			console.error(`${file}:${hit.line} - ${hit.why}: ${hit.values.join(", ")}`)
		}
		if (writeBaseline) continue
		const allowed = baseline[file] ?? {}
		for (const [key, count] of Object.entries(counts)) {
			const limit = allowed[key] ?? 0
			carried += Math.min(count, limit)
			if (count > limit) {
				violations++
				const [why, value] = key.split("|")
				const lines = hits.filter((h) => h.why === why && h.values.some((v) => v.toLowerCase() === value)).map((h) => h.line)
				console.error(`${file}:${lines.join(",")} - ${why}: ${value} (${count} uses, baseline ${limit})`)
			}
		}
	}
	if (writeBaseline) {
		writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, "\t")}\n`)
		console.log(`check:tokens - baseline written for ${FILES.length} file(s).`)
		process.exit(violations ? 1 : 0)
	}
	if (violations) {
		console.error(`\ncheck:tokens - ${violations} violation(s). Read the :root tokens in src/styles.css; if none fits, the token layer is missing one: add it there rather than hardcoding.`)
		process.exit(1)
	}
	console.log(`check:tokens - ${FILES.length} stylesheet(s) clean. ${carried} recorded literal use(s) carried in tools/token-baseline.json; new ones fail and this number should only go down.`)
}
