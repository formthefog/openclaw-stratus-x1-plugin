export type EventType = "pull_request" | "issue" | "issue_comment" | "pull_request_review_comment";
export interface SubwayContact {
    name: string;
    relay: string;
    registered_at: string;
    source: "pi-extension" | "claude-code" | "cli";
}
export type ReviewMode = "review" | "review_and_suggest" | "review_and_patch" | "issue_triage" | "issue_fix" | "manual_only";
export type ActionType = "pr_review" | "pr_fix" | "issue_triage" | "issue_fix" | "slash_command" | "respond" | "noop";
export type FixMode = "propose_only" | "propose_and_pr" | "yolo";
export type FindingSeverity = "low" | "medium" | "high" | "critical";
export type FindingType = "bug" | "security" | "performance" | "maintainability" | "test_gap" | "architecture";
export type FinalAction = "comment_only" | "request_changes" | "suggest_patch" | "open_fix_pr" | "push_to_branch" | "needs_human_review" | "decline";
export interface ChangedFile {
    path: string;
    patch?: string;
    status: "added" | "modified" | "removed" | "renamed";
    additions: number;
    deletions: number;
}
export interface ReviewContext {
    repository: {
        owner: string;
        name: string;
        defaultBranch: string;
    };
    event: {
        type: EventType;
        action: string;
        actor: string;
        trustedActor: boolean;
        isFork: boolean;
        authorAssociation?: string;
    };
    pullRequest?: {
        number: number;
        title: string;
        body: string;
        baseRef: string;
        headRef: string;
        labels: string[];
        changedFiles: ChangedFile[];
        ciStatus?: string;
    };
    issue?: {
        number: number;
        title: string;
        body: string;
        labels: string[];
        comments?: string[];
    };
    repoPolicies: RepoPolicies;
}
export interface RepoPolicies {
    mode: ReviewMode;
    autoFixEnabled: boolean;
    restrictedPaths: string[];
    testCommands: string[];
    maxFiles: number;
    maxPatchChars: number;
    reviewRulesMarkdown?: string;
    architectureNotes?: string;
    severityThreshold: FindingSeverity;
    blockForkMutation: boolean;
    inlineComments: boolean;
    commentStyle: "concise" | "comprehensive";
    models: {
        anthropic: {
            enabled: boolean;
            model: string;
        };
        openai: {
            enabled: boolean;
            model: string;
        };
    };
    trigger: {
        requireLabel: string;
        respondToMentions: boolean;
        respondToReplies: boolean;
        botName: string;
    };
    fix: {
        mode: FixMode;
        confidenceThreshold: number;
        createDraftPr: boolean;
        maxRetryCount: number;
    };
    review: {
        summaryOnClean: boolean;
    };
}
export interface ReviewFinding {
    type: FindingType;
    severity: FindingSeverity;
    title: string;
    file: string;
    lineStart?: number;
    lineEnd?: number;
    explanation: string;
    suggestedFix?: string;
    confidence: number;
    source: "anthropic" | "openai" | "merged";
}
export interface ModelReview {
    summary: string;
    severity: FindingSeverity;
    confidence: number;
    findings: ReviewFinding[];
    mergeBlocking: boolean;
    needsHumanAttention: boolean;
}
export interface CritiqueOutput {
    agreedFindings: string[];
    disputedFindings: Array<{
        finding: string;
        reason: string;
    }>;
    missedIssues: ReviewFinding[];
    overallAssessment: string;
    revisedSeverity: FindingSeverity;
}
export interface CritiqueResponse {
    accepted: string[];
    disputed: Array<{
        critique: string;
        rebuttal: string;
    }>;
    revisedFindings: ReviewFinding[];
    finalSummary: string;
}
export interface FinalDecision {
    action: FinalAction;
    rationale: string;
    findings: ReviewFinding[];
    anthropicReview?: ModelReview;
    openaiReview?: ModelReview;
    critique?: CritiqueOutput;
    critiqueResponse?: CritiqueResponse;
    tokenUsage: {
        anthropic: {
            input: number;
            output: number;
        };
        openai: {
            input: number;
            output: number;
        };
    };
    durationMs: number;
}
export interface SlashCommand {
    command: string;
    args: string[];
    actor: string;
    issueNumber: number;
    isPR: boolean;
}
export interface RoutedEvent {
    actionType: ActionType;
    context: ReviewContext;
    slashCommand?: SlashCommand;
    responseContext?: ResponseContext;
}
export interface ResponseContext {
    parentCommentBody: string;
    replyBody: string;
    commentId: number;
    isPRReviewComment: boolean;
}
export interface TokenUsage {
    input: number;
    output: number;
}
export interface FileChange {
    path: string;
    action: "modify" | "create" | "delete";
    changes?: Array<{
        search: string;
        replace: string;
    }>;
    content?: string;
    explanation: string;
}
export interface FixPlan {
    analysis: string;
    fixable: boolean;
    confidence: number;
    files: FileChange[];
    commitMessage: string;
    testSuggestions: string[];
    riskNotes: string[];
}
export interface FixResult {
    success: boolean;
    fixPlan?: FixPlan;
    branch?: string;
    prNumber?: number;
    prUrl?: string;
    error?: string;
}
export interface CodeContext {
    files: Array<{
        path: string;
        content: string;
        relevance: string;
    }>;
    structure: string;
    dependencies: string;
}
