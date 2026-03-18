import * as github from "@actions/github";
import type { FinalDecision, FixResult, FixMode } from "./types";
type Octokit = ReturnType<typeof github.getOctokit>;
export declare function reportReview(octokit: Octokit, decision: FinalDecision, prNumber: number, summaryOnClean?: boolean): Promise<void>;
export declare function reportIssueTriage(octokit: Octokit, issueNumber: number, classification: string, summary: string): Promise<void>;
export declare function reportFixResult(octokit: Octokit, issueNumber: number, result: FixResult, mode: FixMode): Promise<void>;
export declare function reportFailure(octokit: Octokit, prOrIssueNumber: number, error: string): Promise<void>;
export {};
