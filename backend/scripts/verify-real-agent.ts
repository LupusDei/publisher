/**
 * verify-real-agent.ts — env-gated MANUAL smoke check for the upgraded AI SDK
 * (`ai@^6` + `@ai-sdk/anthropic@^3`). It constructs the REAL Vercel-AI-SDK
 * worker (`AnthropicAgent`) for each model below and makes one tiny live
 * `research()` call, printing OK/ERR per model. This is the live counterpart to
 * the mocked CI unit tests (which never touch the network, ASSUMPTIONS D20):
 * it proves the new SDK call shape actually works against the API — in
 * particular that opus-4-8 accepts our request (no injected `temperature`).
 *
 * SAFETY: it SKIPS CLEANLY (exit 0) when ANTHROPIC_API_KEY is unset, so it is
 * inert in CI and in worktrees with no `.env`. Only run it where a real key is
 * available (e.g. the main repo at merge time).
 *
 * HOW TO RUN (from backend/, with a key in the environment):
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/verify-real-agent.ts
 * Without a key it prints a skip notice and exits 0:
 *   npx tsx scripts/verify-real-agent.ts
 */
import { AnthropicAgent } from "../src/agent/anthropic-agent.js";

/** Models the upgraded SDK must successfully drive. */
const MODELS = ["claude-opus-4-8", "claude-sonnet-4-6"] as const;

/** A trivial concept so the live call is fast and cheap. */
const CONCEPT = "the number seven, in one sentence";

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(
      "[verify-real-agent] SKIP — ANTHROPIC_API_KEY is unset. " +
        "Set it and re-run to exercise the live API. Exiting 0.",
    );
    return;
  }

  console.log(
    "[verify-real-agent] Live check against ai@^6 + @ai-sdk/anthropic@^3 …",
  );
  let failures = 0;

  for (const model of MODELS) {
    const agent = new AnthropicAgent({ apiKey, model });
    try {
      const result = await agent.research({
        system: "You are a concise assistant.",
        concept: CONCEPT,
      });
      const tokens = result.usage.totalTokens;
      const preview = result.value.text.slice(0, 60).replace(/\s+/g, " ");
      console.log(
        `OK  ${model} — finishReason=${result.finishReason}, ` +
          `tokens=${tokens}, text="${preview}…"`,
      );
    } catch (err) {
      failures += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`ERR ${model} — ${message}`);
    }
  }

  if (failures > 0) {
    console.error(`[verify-real-agent] ${failures}/${MODELS.length} model(s) FAILED.`);
    process.exitCode = 1;
    return;
  }
  console.log(`[verify-real-agent] All ${MODELS.length} model(s) OK.`);
}

main().catch((err) => {
  console.error("[verify-real-agent] unexpected error:", err);
  process.exitCode = 1;
});
