/**
 * The entry point the serverless host loads.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS .mjs. Node decides whether a `.js` file
 * is a module or a script by looking at the nearest package.json. When the host
 * compiles src/app.ts and places the result at the root of the deployed bundle,
 * that lookup no longer finds this package's `"type": "module"`, so the output
 * is loaded as CommonJS and the first `import` throws
 * "Cannot use import statement outside a module" before any route runs.
 *
 * A `.mjs` extension is not a hint - it is unambiguous. Node treats the file as
 * a module wherever it ends up, and the platform's own builder short-circuits
 * its format detection on the extension rather than consulting package.json. So
 * the entry point says what it is in its own name, and nothing about where it is
 * copied to can change that.
 *
 * It holds no logic on purpose: `dist/app.js` is the same application the local
 * server runs, built by `npm run build`. Anything written here would be behaviour
 * that only exists in production, which is the kind of difference that is found
 * late and in the worst place.
 */
import app from "../dist/app.js";

export default app;
