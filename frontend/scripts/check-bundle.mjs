// Build assertions for code splitting, run after `vite build`:
//
//   node scripts/check-bundle.mjs [dist-directory]
//
// 1. Every page is loaded lazily: App.tsx imports nothing from ./pages statically.
// 2. The JavaScript a first visit downloads - the entry script plus every chunk
//    index.html preloads - stays within budget, raw and gzipped.
// 3. The vendor chunks exist, so a release of application code alone leaves
//    the framework cached.
//
// Node built-ins only; the project adds no dependency for this.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, process.argv[2] ?? "dist");

/** Budgets with headroom over V3's measured 351 kB / 114 kB; V2's entry alone was 570 kB. */
const BUDGET_RAW_KB = 380;
const BUDGET_GZIP_KB = 125;

const failures = [];

const app = readFileSync(join(root, "src/App.tsx"), "utf8");
const staticPageImports = app.match(/^import\s[^;]*from\s+["']\.\/pages\/[^"']+["'];?$/gm) ?? [];
if (staticPageImports.length > 0) failures.push(`App.tsx imports pages statically:\n  ${staticPageImports.join("\n  ")}`);
const lazyPages = (app.match(/lazy\(\(\) => import\("\.\/pages\//g) ?? []).length;

const html = readFileSync(join(dist, "index.html"), "utf8");
const initial = [
  ...html.matchAll(/<script[^>]+type="module"[^>]+src="\/([^"]+\.js)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/([^"]+\.js)"/g),
].map((match) => match[1]);
const unique = [...new Set(initial)];
let raw = 0;
let gzip = 0;
for (const file of unique) {
  const bytes = readFileSync(join(dist, file));
  raw += bytes.length;
  gzip += gzipSync(bytes, { level: 9 }).length;
}
const rawKb = raw / 1000;
const gzipKb = gzip / 1000;
if (unique.length === 0) failures.push("index.html references no module script");
if (rawKb > BUDGET_RAW_KB) failures.push(`initial JS ${rawKb.toFixed(2)} kB exceeds ${BUDGET_RAW_KB} kB`);
if (gzipKb > BUDGET_GZIP_KB) failures.push(`initial JS gzip ${gzipKb.toFixed(2)} kB exceeds ${BUDGET_GZIP_KB} kB`);

const assets = readdirSync(join(dist, "assets"));
for (const vendor of ["vendor-react", "vendor-router", "vendor-http"]) {
  if (!assets.some((file) => file.startsWith(`${vendor}-`) && file.endsWith(".js"))) failures.push(`no ${vendor} chunk was emitted`);
}
const chunks = assets.filter((file) => file.endsWith(".js")).length;

console.log(`lazy pages: ${lazyPages}; JS chunks: ${chunks}`);
console.log(`initial JS: ${unique.length} files, ${rawKb.toFixed(2)} kB (gzip ${gzipKb.toFixed(2)} kB); budget ${BUDGET_RAW_KB} kB / ${BUDGET_GZIP_KB} kB`);
if (failures.length > 0) {
  console.error(`\nBundle check failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("bundle check passed");
