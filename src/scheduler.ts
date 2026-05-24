import { ResearchOrchestrator } from "./orchestrator";
import { log } from "./utils/logger";

// The scheduler runs immediately, then repeats at the configured interval. This
// makes local testing easy and avoids waiting a full interval for the first run.
export async function runScheduler(
  orchestrator: ResearchOrchestrator,
  intervalHours: number
): Promise<void> {
  const intervalMs = intervalHours * 60 * 60 * 1000;

  const runOnce = async () => {
    log.info("Scheduled run starting", { intervalHours });
    try {
      const result = await orchestrator.run();
      log.info("Scheduled run complete", { reportPath: result.reportPath });
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      log.error("Scheduled run failed", { error: message });
    }
  };

  await runOnce();
  setInterval(runOnce, intervalMs);
}
