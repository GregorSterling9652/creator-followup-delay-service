import assert from "node:assert/strict";
import { buildRunAt, toClientResponse } from "../src/delayed-followup.ts";
import { z } from "zod";

assert.equal(buildRunAt(6, Date.parse("2026-10-03T00:00:00.000Z")), "2026-10-03T06:00:00.000Z");
const result = toClientResponse(new z.ZodError([]));
assert.deepEqual(result, { status: 400, body: { error: "invalid release follow-up request" } });
console.log("delayed follow-up decision test passed");
