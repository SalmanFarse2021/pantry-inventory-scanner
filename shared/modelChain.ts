// Fallback chain from findings 3.1c. Pure: the model call and the quota counter are injected,
// so the retry rules are unit-testable without Gemini or Supabase.
//
//   bad answer (invalid JSON, schema mismatch, 5xx): one retry on the same model, then next tier
//   429 (or our own counter says the model is out):  next tier immediately, no retry
//   every tier out of quota:                         "waiting_quota" (retry after the daily reset)
//   anything else exhausted:                         "failed" (the user types it in)

export type Tier = { model: string; dailyLimit: number };

// Limits from findings 3.1c with a small margin for retries and other users of the key.
export const TIERS: Tier[] = [
  { model: "gemini-3.5-flash-lite", dailyLimit: 480 },
  { model: "gemini-3.1-flash-lite", dailyLimit: 480 },
  { model: "gemma-4-31b-it", dailyLimit: 14000 },
];

export class QuotaError extends Error {}

export type ChainDeps<T> = {
  call: (model: string) => Promise<T>; // throws QuotaError on 429, anything else is a bad answer
  reserve: (tier: Tier) => Promise<boolean>; // false = out of quota today
  markExhausted: (tier: Tier) => Promise<void>;
};

export type ChainResult<T> =
  | { kind: "ok"; value: T; model: string; attempts: number }
  | { kind: "waiting_quota"; attempts: number }
  | { kind: "failed"; attempts: number; error: string };

export async function runChain<T>(tiers: Tier[], deps: ChainDeps<T>): Promise<ChainResult<T>> {
  let attempts = 0;
  const errors: string[] = [];
  let sawFailure = false;

  for (const tier of tiers) {
    let outOfQuota = false;
    for (let retry = 0; retry < 2 && !outOfQuota; retry++) {
      if (!(await deps.reserve(tier))) {
        outOfQuota = true;
        break;
      }
      attempts++;
      try {
        return { kind: "ok", value: await deps.call(tier.model), model: tier.model, attempts };
      } catch (err) {
        if (err instanceof QuotaError) {
          await deps.markExhausted(tier);
          outOfQuota = true;
        } else {
          sawFailure = true;
          errors.push(`${tier.model}: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`);
        }
      }
    }
  }

  if (!sawFailure) return { kind: "waiting_quota", attempts };
  return { kind: "failed", attempts, error: errors.join(" | ") };
}
