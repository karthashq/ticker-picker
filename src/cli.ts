import { defaultConfig } from "./config/defaultConfig";
import { ResearchOrchestrator } from "./orchestrator";
import { runScheduler } from "./scheduler";

// CLI entrypoint for both one-off and periodic runs.
async function main(): Promise<void> {
  const command = process.argv[2] ?? "run";
  const orchestrator = new ResearchOrchestrator(defaultConfig);

  if (command === "run") {
    // One-off mode is useful for ad hoc reports and for verifying provider setup.
    const result = await orchestrator.run();
    console.log(`Research report written: ${result.reportPath}`);
    console.log(`Machine-readable output: ${result.jsonPath}`);
    return;
  }

  if (command === "schedule") {
    // Schedule mode is the long-running process for periodic research.
    await runScheduler(orchestrator, defaultConfig.run.schedulerIntervalHours);
    return;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    console.log("Usage: node dist/src/cli.js [run|schedule]");
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

// Keep top-level errors visible while preserving a non-zero exit code for
// scripts and automation.
main().catch(error => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
