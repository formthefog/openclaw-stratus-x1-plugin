import type { ModelClient } from "./models/types";
import type { ReviewContext, FinalDecision } from "./types";
export declare function orchestrateReview(ctx: ReviewContext, anthropic: ModelClient | null, openai: ModelClient | null): Promise<FinalDecision>;
