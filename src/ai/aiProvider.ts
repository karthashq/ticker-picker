// AIProvider is a minimal interface so the pipeline can call any LLM without
// coupling to a specific SDK or vendor. Each provider translates a plain-text
// prompt into a plain-text completion. Agents treat the result as enrichment
// only: if the provider returns an empty string the agent falls back to its
// deterministic template output.
export interface AIProvider {
  readonly modelId: string;
  complete(prompt: string, maxTokens?: number): Promise<string>;
}
