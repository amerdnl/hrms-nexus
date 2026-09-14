import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * A response must never be sent before its transaction commits: the client would be
 * told a change is done that it cannot yet read, and a failed COMMIT would follow a
 * success response. The final V3 laboratory run caught exactly that, intermittently,
 * when a goal completion was read back before it had committed.
 *
 * Controllers whose `inTransaction` helper commits after the work records the reply
 * and sends it after COMMIT. This guards the shape, so a later handler cannot reopen
 * the race by answering from inside the callback.
 */
const HELPER_CONTROLLERS = ["lifecycleController.ts", "performanceController.ts"];

function callbackBodies(source: string): string[] {
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const call = source.indexOf("await inTransaction(response, \"", from);
    if (call === -1) return bodies;
    const open = source.indexOf("{", source.indexOf("=>", call));
    let depth = 0;
    let quote: string | null = null;
    let end = open;
    for (; end < source.length; end += 1) {
      const character = source[end]!;
      if (quote) {
        if (character === "\\") { end += 1; continue; }
        if (character === quote) quote = null;
      } else if (character === "\"" || character === "'" || character === "`") {
        quote = character;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    bodies.push(source.slice(open, end));
    from = end;
  }
}

for (const file of HELPER_CONTROLLERS) {
  test(`${file}: replies are sent only after the transaction commits`, () => {
    const source = readFileSync(new URL(`../src/controllers/${file}`, import.meta.url), "utf8");
    const helper = source.slice(source.indexOf("async function inTransaction("));
    const commit = helper.indexOf("await client.query(\"COMMIT\");");
    const send = helper.indexOf("if (outcome.reply) response.status(outcome.reply.status).json(outcome.reply.body);");
    assert.ok(commit > 0 && send > commit, "the helper sends the recorded reply after COMMIT");

    const bodies = callbackBodies(source);
    assert.ok(bodies.length > 0, "the controller has transactional handlers");
    for (const body of bodies) {
      assert.equal(/\bresponse\b/.test(body), false, `a transactional handler answers directly:\n${body.slice(0, 200)}`);
      assert.ok(body.includes("reply("), "every transactional handler records a reply");
    }
  });
}
