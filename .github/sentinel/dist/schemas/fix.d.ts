import { z } from "zod";
export declare const FileChangeSchema: z.ZodObject<{
    path: z.ZodString;
    action: z.ZodEnum<["modify", "create", "delete"]>;
    changes: z.ZodOptional<z.ZodArray<z.ZodObject<{
        search: z.ZodString;
        replace: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        replace: string;
        search: string;
    }, {
        replace: string;
        search: string;
    }>, "many">>;
    content: z.ZodOptional<z.ZodString>;
    explanation: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
    action: "modify" | "create" | "delete";
    explanation: string;
    content?: string | undefined;
    changes?: {
        replace: string;
        search: string;
    }[] | undefined;
}, {
    path: string;
    action: "modify" | "create" | "delete";
    explanation: string;
    content?: string | undefined;
    changes?: {
        replace: string;
        search: string;
    }[] | undefined;
}>;
export declare const FixPlanSchema: z.ZodObject<{
    analysis: z.ZodString;
    fixable: z.ZodBoolean;
    confidence: z.ZodNumber;
    files: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        action: z.ZodEnum<["modify", "create", "delete"]>;
        changes: z.ZodOptional<z.ZodArray<z.ZodObject<{
            search: z.ZodString;
            replace: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            replace: string;
            search: string;
        }, {
            replace: string;
            search: string;
        }>, "many">>;
        content: z.ZodOptional<z.ZodString>;
        explanation: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        path: string;
        action: "modify" | "create" | "delete";
        explanation: string;
        content?: string | undefined;
        changes?: {
            replace: string;
            search: string;
        }[] | undefined;
    }, {
        path: string;
        action: "modify" | "create" | "delete";
        explanation: string;
        content?: string | undefined;
        changes?: {
            replace: string;
            search: string;
        }[] | undefined;
    }>, "many">;
    commit_message: z.ZodString;
    test_suggestions: z.ZodArray<z.ZodString, "many">;
    risk_notes: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    files: {
        path: string;
        action: "modify" | "create" | "delete";
        explanation: string;
        content?: string | undefined;
        changes?: {
            replace: string;
            search: string;
        }[] | undefined;
    }[];
    analysis: string;
    fixable: boolean;
    confidence: number;
    commit_message: string;
    test_suggestions: string[];
    risk_notes: string[];
}, {
    files: {
        path: string;
        action: "modify" | "create" | "delete";
        explanation: string;
        content?: string | undefined;
        changes?: {
            replace: string;
            search: string;
        }[] | undefined;
    }[];
    analysis: string;
    fixable: boolean;
    confidence: number;
    commit_message: string;
    test_suggestions: string[];
    risk_notes: string[];
}>;
export declare const FixReviewSchema: z.ZodObject<{
    approved: z.ZodBoolean;
    confidence: z.ZodNumber;
    concerns: z.ZodArray<z.ZodString, "many">;
    verdict: z.ZodString;
}, "strip", z.ZodTypeAny, {
    confidence: number;
    approved: boolean;
    concerns: string[];
    verdict: string;
}, {
    confidence: number;
    approved: boolean;
    concerns: string[];
    verdict: string;
}>;
export declare function parseFixPlan(raw: string): z.infer<typeof FixPlanSchema>;
export declare function parseFixReview(raw: string): z.infer<typeof FixReviewSchema>;
//# sourceMappingURL=fix.d.ts.map