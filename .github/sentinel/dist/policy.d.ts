import * as github from "@actions/github";
import type { RepoPolicies } from "./types";
type Octokit = ReturnType<typeof github.getOctokit>;
export declare function loadPolicies(octokit: Octokit, configPath: string, modeOverride?: string): Promise<RepoPolicies>;
export declare function evaluateTrust(ctx: {
    actor: string;
    isFork: boolean;
    policies: RepoPolicies;
}): {
    trusted: boolean;
    canMutate: boolean;
    reason: string;
};
export declare function isRestrictedPath(filePath: string, patterns: string[]): boolean;
export {};
