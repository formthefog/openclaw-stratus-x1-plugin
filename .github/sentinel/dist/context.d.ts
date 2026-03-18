import * as github from "@actions/github";
import type { ReviewContext } from "./types";
type Octokit = ReturnType<typeof github.getOctokit>;
export declare function buildPRContext(ctx: ReviewContext, octokit: Octokit): Promise<ReviewContext>;
export declare function buildIssueContext(ctx: ReviewContext, octokit: Octokit): Promise<ReviewContext>;
export {};
