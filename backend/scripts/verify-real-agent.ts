/**
 * verify-real-agent.ts — env-gated MANUAL smoke check for the real Anthropic
 * workers. Covers both implementations behind the `Agent` seam:
 *
 *   1. Vercel AI SDK workers (`AnthropicAgent`) — opus + sonnet models
 *   2. Native Anthropic SDK research worker (`AnthropicResearchAgent`) —
 *      real web_search + web_fetch; proves sources[] is populated so the
 *      research-sufficiency checkpoint (>= 3 distinct sources) can pass.
 *
 * This is the live counterpart to the mocked CI unit tests (which never touch
 * the network, ASSUMPTIONS D20): it proves that each concrete agent
 * implementation works against the live API. In particular it verifies:
 *   - `AnthropicAgent`: the Vercel AI SDK call shape is accepted (no injected
 *     `temperature` on Opus 4.8)
 *   - `AnthropicResearchAgent`: server-side web_search fires, real source URLs
 *     are returned in `sources[]`, and research-sufficiency would pass
 *
 * SAFETY: the script SKIPS CLEANLY (exit 0) when ANTHROPIC_API_KEY is unset,
 * so it is inert in CI and in worktrees with no `.env`. Only run it where a
 * real key is available (e.g. the main repo at merge time or manually by an
 * operator who wants end-to-end confidence).
 *
 * HOW TO RUN (from the repo root, with a key in the environment):
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx backend/scripts/verify-real-agent.ts
 * Or from backend/:
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/verify-real-agent.ts
 *
 * Without a key it prints a skip notice and exits 0:
 *   npx tsx backend/scripts/verify-real-agent.ts
 *
 * ---------------------------------------------------------------------------
 * MANUAL END-TO-END CHECKLIST (rrt.5.2)
 * ---------------------------------------------------------------------------
 * The following steps describe the full harness flow that a live end-to-end
 * run should produce when USE_REAL_AGENT=true and the anthropic-research
 * worker is selected. This mirrors the coordinator's observed successful run
 * (worker: anthropic-research, ~160s, zero alarms):
 *
 *  [ ] 1. Start: npm run dev (backend :4000 + frontend :3000)
 *  [ ] 2. Create a persona (onboarding) with a rich voiceSample
 *  [ ] 3. Start a run, select "Claude Opus 4.8 (real web research)" worker
 *  [ ] 4. Research phase: the run stream shows real web_search + web_fetch
 *         tool calls. The research phase typically takes 1-3 minutes.
 *  [ ] 5. research-sufficiency checkpoint PASSES:
 *         score >= 3 (the coordinator observed score 51 sources)
 *  [ ] 6. Build phase: the agent builds the page using real Opus 4.8 via the
 *         native Anthropic SDK's messages.parse + zodOutputFormat
 *  [ ] 7. voice-fidelity checkpoint PASSES with the REAL Claude judge:
 *         score >= 0.75 (coordinator observed 0.96)
 *  [ ] 8. design-conformance checkpoint PASSES: score 1.0
 *  [ ] 9. quality checkpoint PASSES: score 1.0
 *  [ ] 10. Run reaches `awaiting_approval` state — zero alarms
 *  [ ] 11. Published page shows real source URLs in sourcesUsed[]
 *
 * Expected outcome: all four checkpoints pass, run reaches awaiting_approval
 * with zero alarms. The real voice judge (USE_REAL_AGENT=true auto-selects it)
 * scores the page via a Claude generateObject call and returns score in [0,1].
 * Any judge fault → CHECKPOINT_ERROR (critical) → fail-closed.
 * ---------------------------------------------------------------------------
 */
import { AnthropicAgent } from "../src/agent/anthropic-agent.js";
import { AnthropicResearchAgent } from "../src/agent/anthropic-research-agent.js";

/** Models the Vercel AI SDK worker must successfully drive. */
const VERCEL_SDK_MODELS = ["claude-opus-4-8", "claude-sonnet-4-6"] as const;

/** A trivial concept so the Vercel SDK live call is fast and cheap. */
const SIMPLE_CONCEPT = "the number seven, in one sentence";

/** A real concept for the research worker — needs enough depth to fire web search. */
const RESEARCH_CONCEPT = "the history of the Oxford comma";

/** Minimum distinct sources required by the research-sufficiency checkpoint. */
const RESEARCH_MIN_SOURCES = 3;

async function checkVercelSdkWorkers(apiKey: string): Promise<number> {
  console.log("\n[verify-real-agent] -- Vercel AI SDK workers (opus + sonnet) --");
  let failures = 0;

  for (const model of VERCEL_SDK_MODELS) {
    const agent = new AnthropicAgent({ apiKey, model });
    try {
      const result = await agent.research({
        system: "You are a concise assistant.",
        concept: SIMPLE_CONCEPT,
      });
      const tokens = result.usage.totalTokens;
      const preview = result.value.text.slice(0, 60).replace(/\s+/g, " ");
      console.log(
        `  OK  ${model} — finishReason=${result.finishReason}, ` +
          `tokens=${tokens}, text="${preview}…"`,
      );
    } catch (err) {
      failures += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ERR ${model} — ${message}`);
    }
  }

  return failures;
}

async function checkResearchWorker(apiKey: string): Promise<number> {
  console.log(
    "\n[verify-real-agent] -- anthropic-research worker (native SDK + web_search) --",
  );
  let failures = 0;

  const agent = new AnthropicResearchAgent({
    apiKey,
    model: "claude-opus-4-8",
    workerId: "anthropic-research",
  });

  try {
    console.log(
      `  Researching concept: "${RESEARCH_CONCEPT}" (may take 30-120s) …`,
    );
    const result = await agent.research({
      system: "You are a meticulous researcher. Use web search to gather real sources.",
      concept: RESEARCH_CONCEPT,
    });

    const sourceCount = result.value.sources.length;
    const preview = result.value.text.slice(0, 80).replace(/\s+/g, " ");
    const sourcePreview = result.value.sources.slice(0, 3).join(", ");

    console.log(
      `  OK  anthropic-research — finishReason=${result.finishReason}, ` +
        `tokens=${result.usage.totalTokens}, sources=${sourceCount}`,
    );
    console.log(`  text preview: "${preview}…"`);
    if (sourceCount > 0) {
      console.log(`  sources (first 3): ${sourcePreview}`);
    }

    // Verify research-sufficiency would pass.
    if (sourceCount < RESEARCH_MIN_SOURCES) {
      failures += 1;
      console.error(
        `  ERR anthropic-research — only ${sourceCount} source(s) returned; ` +
          `research-sufficiency requires >= ${RESEARCH_MIN_SOURCES}. ` +
          `The checkpoint would FAIL. Check web_search tool availability.`,
      );
    } else {
      console.log(
        `  research-sufficiency: WOULD PASS (${sourceCount} sources >= ${RESEARCH_MIN_SOURCES})`,
      );
    }
  } catch (err) {
    failures += 1;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ERR anthropic-research — ${message}`);
  }

  return failures;
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(
      "[verify-real-agent] SKIP — ANTHROPIC_API_KEY is unset. " +
        "Set it and re-run to exercise the live API. Exiting 0.",
    );
    return;
  }

  console.log("[verify-real-agent] Live check against real Anthropic API …");

  const vercelFailures = await checkVercelSdkWorkers(apiKey);
  const researchFailures = await checkResearchWorker(apiKey);
  const totalFailures = vercelFailures + researchFailures;

  console.log("");
  if (totalFailures > 0) {
    console.error(
      `[verify-real-agent] ${totalFailures} check(s) FAILED. See output above.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log("[verify-real-agent] All checks OK.");
}

main().catch((err) => {
  console.error("[verify-real-agent] unexpected error:", err);
  process.exitCode = 1;
});
