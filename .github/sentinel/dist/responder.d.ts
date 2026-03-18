import * as github from "@actions/github";
import type { ModelClient } from "./models/types";
import type { ReviewContext, ResponseContext } from "./types";
type Octokit = ReturnType<typeof github.getOctokit>;
export declare function handleResponse(ctx: ReviewContext, responseContext: ResponseContext, model: ModelClient, octokit: Octokit): Promise<void>;
export {};
