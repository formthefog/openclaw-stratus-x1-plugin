import type { SubwayContact, FinalDecision } from "./types";
export interface SubwayNotifyContext {
    prNumber: number;
    prUrl: string;
    repo: string;
    runUrl: string;
    headSha: string;
    prState: "open" | "closed" | "merged";
}
export interface SubwayPayload {
    pr_number: number;
    pr_url: string;
    repo: string;
    head_sha: string;
    pr_state: "open" | "closed" | "merged";
    action: string;
    has_blockers: boolean;
    findings_count: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    quality_score: number;
    model_agreement: number;
    run_url: string;
}
export declare function readPrContact(workspaceDir?: string): SubwayContact | null;
export declare function parseTrailerContact(msg: string): SubwayContact | null;
export declare function readCommitContact(headSha?: string): SubwayContact | null;
export declare function isContactFresh(contact: SubwayContact, maxAgeMs?: number): boolean;
export declare function notifySubwayAgent(contact: SubwayContact | null, decision: FinalDecision, ctx: SubwayNotifyContext, bridgeUrl: string): Promise<void>;
