/**
 * The entry point a serverless host loads. Local development does not use it:
 * `npm run dev` and `npm start` both go through src/server.ts, which listens on
 * a port. A host that invokes a function instead of running a server needs an
 * app to hand requests to, and needs to load it as a module.
 *
 * WHY THE NAME MATTERS. The host picks an entry point by looking for
 * app/index/server (with and without src/) and compiles whatever it finds.
 * Given src/app.ts it emits ES module code into a file named app.js, and Node
 * decides a .js file is a script unless the nearest package.json says
 * otherwise - which, at the root of a deployed bundle, it does not. The result
 * is "Cannot use import statement outside a module" on the first line, before a
 * single route is registered, and every request fails including the health
 * check.
 *
 * A `.mjs` entry point removes the ambiguity: the extension alone decides the
 * format, both for the host's bundler and for Node itself, wherever the output
 * is copied to. `app.mjs` sits ahead of `src/app.ts` in the search order, so it
 * is found first and nothing depends on extra configuration being honoured.
 *
 * It holds no logic. dist/app.js is the same application the local server runs,
 * built by `npm run build`, so nothing exists in production that is not also
 * exercised locally and in the tests.
 */

// A real import, and the one the host's framework detection looks for: it
// identifies this file as the Express entry point rather than an unrelated
// module that happens to be called app. Express is already in the graph below,
// so this costs nothing at runtime.
import "express";

import app from "./dist/app.js";

export default app;
