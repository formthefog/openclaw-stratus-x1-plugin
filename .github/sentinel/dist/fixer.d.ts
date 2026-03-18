import * as github from "@actions/github";
import type { ModelClient } from "./models/types";
import type { ReviewContext, FixMode, FixResult } from "./types";
type Octokit = ReturnType<typeof github.getOctokit>;
export declare function fixIssue(ctx: ReviewContext, anthropic: ModelClient | null, openai: ModelClient | null, octokit: Octokit, mode: FixMode, confidenceThreshold: number): Promise<FixResult>;
export {};
