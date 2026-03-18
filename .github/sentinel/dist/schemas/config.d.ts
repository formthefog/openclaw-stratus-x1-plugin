import { z } from "zod";
export declare const SentinelConfigSchema: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<["review", "review_and_suggest", "review_and_patch", "issue_triage", "issue_fix", "manual_only"]>>;
    models: z.ZodDefault<z.ZodObject<{
        anthropic: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            model: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            model: string;
        }, {
            enabled?: boolean | undefined;
            model?: string | undefined;
        }>>;
        openai: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            model: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            model: string;
        }, {
            enabled?: boolean | undefined;
            model?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        anthropic: {
            enabled: boolean;
            model: string;
        };
        openai: {
            enabled: boolean;
            model: string;
        };
    }, {
        anthropic?: {
            enabled?: boolean | undefined;
            model?: string | undefined;
        } | undefined;
        openai?: {
            enabled?: boolean | undefined;
            model?: string | undefined;
        } | undefined;
    }>>;
    trigger: z.ZodDefault<z.ZodObject<{
        require_label: z.ZodDefault<z.ZodString>;
        respond_to_mentions: z.ZodDefault<z.ZodBoolean>;
        respond_to_replies: z.ZodDefault<z.ZodBoolean>;
        bot_name: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        require_label: string;
        respond_to_mentions: boolean;
        respond_to_replies: boolean;
        bot_name: string;
    }, {
        require_label?: string | undefined;
        respond_to_mentions?: boolean | undefined;
        respond_to_replies?: boolean | undefined;
        bot_name?: string | undefined;
    }>>;
    review: z.ZodDefault<z.ZodObject<{
        max_files: z.ZodDefault<z.ZodNumber>;
        max_patch_chars: z.ZodDefault<z.ZodNumber>;
        comment_style: z.ZodDefault<z.ZodEnum<["concise", "comprehensive"]>>;
        inline_comments: z.ZodDefault<z.ZodBoolean>;
        severity_threshold: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
        summary_on_clean: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        max_files: number;
        max_patch_chars: number;
        comment_style: "concise" | "comprehensive";
        inline_comments: boolean;
        severity_threshold: "low" | "medium" | "high" | "critical";
        summary_on_clean: boolean;
    }, {
        max_files?: number | undefined;
        max_patch_chars?: number | undefined;
        comment_style?: "concise" | "comprehensive" | undefined;
        inline_comments?: boolean | undefined;
        severity_threshold?: "low" | "medium" | "high" | "critical" | undefined;
        summary_on_clean?: boolean | undefined;
    }>>;
    fix: z.ZodDefault<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<["propose_only", "propose_and_pr", "yolo"]>>;
        confidence_threshold: z.ZodDefault<z.ZodNumber>;
        max_retry_count: z.ZodDefault<z.ZodNumber>;
        create_draft_pr: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        mode: "propose_only" | "propose_and_pr" | "yolo";
        confidence_threshold: number;
        max_retry_count: number;
        create_draft_pr: boolean;
    }, {
        mode?: "propose_only" | "propose_and_pr" | "yolo" | undefined;
        confidence_threshold?: number | undefined;
        max_retry_count?: number | undefined;
        create_draft_pr?: boolean | undefined;
    }>>;
    security: z.ZodDefault<z.ZodObject<{
        restricted_paths: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        block_fork_mutation: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        restricted_paths: string[];
        block_fork_mutation: boolean;
    }, {
        restricted_paths?: string[] | undefined;
        block_fork_mutation?: boolean | undefined;
    }>>;
    validation: z.ZodDefault<z.ZodObject<{
        commands: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        commands: string[];
    }, {
        commands?: string[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    mode: "issue_triage" | "issue_fix" | "review" | "review_and_suggest" | "review_and_patch" | "manual_only";
    fix: {
        mode: "propose_only" | "propose_and_pr" | "yolo";
        confidence_threshold: number;
        max_retry_count: number;
        create_draft_pr: boolean;
    };
    review: {
        max_files: number;
        max_patch_chars: number;
        comment_style: "concise" | "comprehensive";
        inline_comments: boolean;
        severity_threshold: "low" | "medium" | "high" | "critical";
        summary_on_clean: boolean;
    };
    validation: {
        commands: string[];
    };
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
        require_label: string;
        respond_to_mentions: boolean;
        respond_to_replies: boolean;
        bot_name: string;
    };
    security: {
        restricted_paths: string[];
        block_fork_mutation: boolean;
    };
}, {
    mode?: "issue_triage" | "issue_fix" | "review" | "review_and_suggest" | "review_and_patch" | "manual_only" | undefined;
    fix?: {
        mode?: "propose_only" | "propose_and_pr" | "yolo" | undefined;
        confidence_threshold?: number | undefined;
        max_retry_count?: number | undefined;
        create_draft_pr?: boolean | undefined;
    } | undefined;
    review?: {
        max_files?: number | undefined;
        max_patch_chars?: number | undefined;
        comment_style?: "concise" | "comprehensive" | undefined;
        inline_comments?: boolean | undefined;
        severity_threshold?: "low" | "medium" | "high" | "critical" | undefined;
        summary_on_clean?: boolean | undefined;
    } | undefined;
    validation?: {
        commands?: string[] | undefined;
    } | undefined;
    models?: {
        anthropic?: {
            enabled?: boolean | undefined;
            model?: string | undefined;
        } | undefined;
        openai?: {
            enabled?: boolean | undefined;
            model?: string | undefined;
        } | undefined;
    } | undefined;
    trigger?: {
        require_label?: string | undefined;
        respond_to_mentions?: boolean | undefined;
        respond_to_replies?: boolean | undefined;
        bot_name?: string | undefined;
    } | undefined;
    security?: {
        restricted_paths?: string[] | undefined;
        block_fork_mutation?: boolean | undefined;
    } | undefined;
}>;
export type SentinelConfig = z.infer<typeof SentinelConfigSchema>;
//# sourceMappingURL=config.d.ts.map