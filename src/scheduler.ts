import { ResearchOrchestrator } from "./orchestrator";

// The scheduler runs immediately, then repeats at the configured interval. This
// makes local testing easy and avoids waiting a full interval for the first run.
export async function runScheduler(
  orchestrator: ResearchOrchestrator,
  intervalHours: number
): Promise<void> {
  const intervalMs = intervalHours * 60 * 60 * 1000;

  const runOnce = async () => {
    const startedAt = new Date().toISOString();
    console.log(`[${startedAt}] Starting ticker research run.`);
    try {
      // Each scheduled run is isolated. Failures are logged, but the scheduler
      // remains alive for the next interval.
      const result = await orchestrator.run();
      console.log(
        `[${new Date().toISOString()}] Completed run. Report: ${result.reportPath}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      console.error(`[${new Date().toISOString()}] Research run failed.`);
      console.error(message);
    }
  };

  await runOnce();
  setInterval(runOnce, intervalMs);
}
