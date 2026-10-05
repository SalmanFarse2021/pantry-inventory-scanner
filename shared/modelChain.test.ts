import assert from "node:assert/strict";
import { test } from "node:test";
import { QuotaError, runChain, type Tier } from "./modelChain";

const tiers: Tier[] = [
  { model: "a", dailyLimit: 10 },
  { model: "b", dailyLimit: 10 },
  { model: "c", dailyLimit: 10 },
];

function deps(script: Record<string, Array<"ok" | "bad" | "429">>, out: string[] = []) {
  const calls: string[] = [];
  return {
    calls,
    d: {
      call: async (model: string) => {
        calls.push(model);
        const step = script[model]?.shift() ?? "bad";
        if (step === "429") throw new QuotaError("429");
        if (step === "bad") throw new Error("bad json");
        return model;
      },
      reserve: async (t: Tier) => !out.includes(t.model),
      markExhausted: async (t: Tier) => void out.push(t.model),
    },
  };
}

test("first tier answers", async () => {
  const { d, calls } = deps({ a: ["ok"] });
  const r = await runChain(tiers, d);
  assert.deepEqual(r, { kind: "ok", value: "a", model: "a", attempts: 1 });
  assert.deepEqual(calls, ["a"]);
});

test("a bad answer retries once on the same model", async () => {
  const { d, calls } = deps({ a: ["bad", "ok"] });
  const r = await runChain(tiers, d);
  assert.equal(r.kind, "ok");
  assert.deepEqual(calls, ["a", "a"]);
});

test("two bad answers move to the next tier", async () => {
  const { d, calls } = deps({ a: ["bad", "bad"], b: ["ok"] });
  const r = await runChain(tiers, d);
  assert.equal(r.kind === "ok" && r.model, "b");
  assert.deepEqual(calls, ["a", "a", "b"]);
});

test("429 skips to the next tier without retrying", async () => {
  const { d, calls } = deps({ a: ["429"], b: ["ok"] });
  await runChain(tiers, d);
  assert.deepEqual(calls, ["a", "b"]);
});

test("a tier already out for the day is never called", async () => {
  const { d, calls } = deps({ b: ["ok"] }, ["a"]);
  await runChain(tiers, d);
  assert.deepEqual(calls, ["b"]);
});

test("every tier out of quota waits", async () => {
  const { d } = deps({}, ["a", "b", "c"]);
  assert.equal((await runChain(tiers, d)).kind, "waiting_quota");
});

test("every tier failing with bad answers is a failure", async () => {
  const { d } = deps({});
  const r = await runChain(tiers, d);
  assert.equal(r.kind, "failed");
});
