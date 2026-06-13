/**
 * /runs/demo — thin route wrapper around the testable DemoRunner. The runner
 * streams the deterministic mock narratives (R1/R2/R5/R10) with no backend, so
 * the proof surface is demoable even before Track G's SSE endpoint is wired.
 */
import { DemoRunner } from "@/components/DemoRunner";

export default function DemoPage(): React.ReactElement {
  return <DemoRunner />;
}
