import { z } from "zod";
export declare const FindingSeveritySchema: z.ZodEnum<["low", "medium", "high", "critical"]>;
export declare const FindingTypeSchema: z.ZodEnum<["bug", "security", "performance", "maintainability", "test_gap", "architecture"]>;
export declare const ReviewFindingSchema: z.ZodObject<{
    type: z.ZodEnum<["bug", "security", "performance", "maintainability", "test_gap", "architecture"]>;
    severity: z.ZodEnum<["low", "medium", "high", "critical"]>;
    title: z.ZodString;
    file: z.ZodString;
    line_start: z.ZodOptional<z.ZodNumber>;
    line_end: z.ZodOptional<z.ZodNumber>;
    explanation: z.ZodString;
    suggested_fix: z.ZodOptional<z.ZodString>;
    confidence: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    title: string;
    type: "security" | "bug" | "performance" | "maintainability" | "test_gap" | "architecture";
    confidence: number;
    explanation: string;
    severity: "low" | "medium" | "high" | "critical";
    file: string;
    line_start?: number | undefined;
    line_end?: number | undefined;
    suggested_fix?: string | undefined;
}, {
    title: string;
    type: "security" | "bug" | "performance" | "maintainability" | "test_gap" | "architecture";
    confidence: number;
    explanation: string;
    severity: "low" | "medium" | "high" | "critical";
    file: string;
    line_start?: number | undefined;
    line_end?: number | undefined;
    suggested_fix?: string | undefined;
}>;
export declare const ModelReviewSchema: z.ZodObject<{
    summary: z.ZodString;
    severity: z.ZodEnum<["low", "medium", "high", "critical"]>;
    confidence: z.ZodNumber;
    findings: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["bug", "security", "performance", "maintainability", "test_gap", "architecture"]>;
        severity: z.ZodEnum<["low", "medium", "high", "critical"]>;
        title: z.ZodString;
        file: z.ZodString;
        line_start: z.ZodOptional<z.ZodNumber>;
        line_end: z.ZodOptional<z.ZodNumber>;
        explanation: z.ZodString;
        suggested_fix: z.ZodOptional<z.ZodString>;
        confidence: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        title: string;
        type: "security" | "bug" | "performance" | "maintainability" | "test_gap" | "architecture";
        confidence: number;
        explanation: string;
        severity: "low" | "medium" | "high" | "critical";
        file: string;
        line_start?: number | undefined;
        line_end?: number | undefined;
        suggested_fix?: string | undefined;
    }, {
        title: string;
        type: "security" | "bug" | "performance" | "maintainability" | "test_gap" | "architecture";
        confidence: number;
        explanation: string;
        severity: "low" | "medium" | "high" | "critical";
        file: string;
        line_start?: number | undefined;
        line_end?: number | undefined;
        suggested_fix?: string | undefined;
    }>, "many">;
    merge_blocking: z.ZodBoolean;
    needs_human_attention: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    findings: {
        title: string;
        type: "security" | "bug" | "performance" | "maintainability" | "test_gap" | "architecture";
        confidence: number;
        explanation: string;
        severity: "low" | "medium" | "high" | "critical";
        file: string;
        line_start?: number | undefined;
        line_end?: number | undefined;
        suggested_fix?: string | undefined;
    }[];
    confidence: number;
    summary: string;
    severity: "low" | "medium" | "high" | "critical";
    merge_blocking: boolean;
    needs_human_attention: boolean;
}, {
    findings: {
        title: string;
        type: "security" | "bug" | "performance" | "maintainability" | "test_gap" | "architecture";
        confidence: number;
        explanation: string;
        severity: "low" | "medium" | "high" | "critical";
        file: string;
        line_start?: number | undefined;
        line_end?: number | undefined;
        suggested_fix?: string | undefined;
    }[];
    confidence: number;
    summary: string;
    severity: "low" | "medium" | "high" | "critical";
    merge_blocking: boolean;
    needs_human_attention: boolean;
}>;
export declare const CritiqueOutputSchema: z.ZodObject<{
    agreed_findings: z.ZodArray<z.ZodString, "many">;
    disputed_findings: z.ZodArray<z.ZodObject<{
        finding: z.ZodString;
        reason: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        finding: string;
        reason: string;
    }, {
        finding: string;
        reason: string;
    }>, "many">;
    missed_issues: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["bug", "security", "performance", "maintainability", "test_gap", "architecture"]>;
        severity: z.ZodEnum<["low", "medium", "high", "critical"]>;
        title: z.ZodString;
        file: z.ZodString;
        line_start: z.ZodOptional<z.ZodNumber>;
        line_end: z.ZodOptional<z.ZodNumber>;
        explanation: z.ZodString;
        suggested_fix: z.ZodOptional<z.ZodString>;
        confidence: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        title: string;
        type: "security" | "bug" | "performance" | "maintainability" | "test_gap" | "architecture";
        confidence: number;
        explanation: string;
        severity: "low" | "medium" | "high" | "critical";
        file: string;
        line_start?: number | undefined;
        line_end?: number | undefined;
        suggested_fix?: string | undefined;
    }, {
        title: string;
        type: "security" | "bug" | "performance" | "maintainability" | "test_gap" | "architecture";
        confidence: number;
        explanation: string;
        severity: "low" | "medium" | "high" | "critical";
        file: string;
        line_start?: number | undefined;
        line_end?: number | undefined;
        suggested_fix?: string | undefined;
    }>, "many">;
    overall_assessment: z.ZodString;
    revised_severity: z.ZodEnum<["low", "medium", "high", "critical"]>;
}, "strip", z.ZodTypeAny, {
    agreed_findings: string[];
    disputed_findings: {
        finding: string;
        reason: string;
    }[];
    missed_issues: {
        title: string;
        type: "security" | "bug" | "performance" | "maintainability" | "test_gap" | "architecture";
        confidence: number;
        explanation: string;
        severity: "low" | "medium" | "high" | "critical";
        file: string;
        line_start?: number | undefined;
        line_end?: number | undefined;
        suggested_fix?: string | undefined;
    }[];
    overall_assessment: string;
    revised_severity: "low" | "medium" | "high" | "critical";
}, {
    agreed_findings: string[];
    disputed_findings: {
        finding: string;
        reason: string;
    }[];
    missed_issues: {
        title: string;
        type: "security" | "bug" | "performance" | "maintainability" | "test_gap" | "architecture";
        confidence: number;
        explanation: string;
        severity: "low" | "medium" | "high" | "critical";
        file: string;
        line_start?: number | undefined;
        line_end?: number | undefined;
        suggested_fix?: string | undefined;
    }[];
    overall_assessment: string;
    revised_severity: "low" | "medium" | "high" | "critical";
}>;
export declare const CritiqueResponseSchema: z.ZodObject<{
    accepted: z.ZodArray<z.ZodString, "many">;
    disputed: z.ZodArray<z.ZodObject<{
        critique: z.ZodString;
        rebuttal: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        critique: string;
        rebuttal: string;
    }, {
        critique: string;
        rebuttal: string;
    }>, "many">;
    revised_findings: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["bug", "security", "performance", "maintainability", "test_gap", "architecture"]>;
        severity: z.ZodEnum<["low", "medium", "high", "critical"]>;
        title: z.ZodString;
        file: z.ZodString;
        line_start: z.ZodOptional<z.ZodNumber>;
        line_end: z.ZodOptional<z.ZodNumber>;
        explanation: z.ZodString;
        suggested_fix: z.ZodOptional<z.ZodString>;
        confidence: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        title: string;
        type: "security" | "bug" | "performance" | "maintainability" | "test_gap" | "architecture";
        confidence: number;
        explanation: string;
        severity: "low" | "medium" | "high" | "critical";
        file: string;
        line_start?: number | undefined;
        line_end?: number | undefined;
        suggested_fix?: string | undefined;
    }, {
        title: string;
        type: "security" | "bug" | "performance" | "maintainability" | "test_gap" | "architecture";
        confidence: number;
        explanation: string;
        severity: "low" | "medium" | "high" | "critical";
        file: string;
        line_start?: number | undefined;
        line_end?: number | undefined;
        suggested_fix?: string | undefined;
    }>, "many">;
    final_summary: z.ZodString;
}, "strip", z.ZodTypeAny, {
    accepted: string[];
    disputed: {
        critique: string;
        rebuttal: string;
    }[];
    revised_findings: {
        title: string;
        type: "security" | "bug" | "performance" | "maintainability" | "test_gap" | "architecture";
        confidence: number;
        explanation: string;
        severity: "low" | "medium" | "high" | "critical";
        file: string;
        line_start?: number | undefined;
        line_end?: number | undefined;
        suggested_fix?: string | undefined;
    }[];
    final_summary: string;
}, {
    accepted: string[];
    disputed: {
        critique: string;
        rebuttal: string;
    }[];
    revised_findings: {
        title: string;
        type: "security" | "bug" | "performance" | "maintainability" | "test_gap" | "architecture";
        confidence: number;
        explanation: string;
        severity: "low" | "medium" | "high" | "critical";
        file: string;
        line_start?: number | undefined;
        line_end?: number | undefined;
        suggested_fix?: string | undefined;
    }[];
    final_summary: string;
}>;
export declare function parseModelReview(raw: string): z.infer<typeof ModelReviewSchema>;
export declare function parseCritiqueOutput(raw: string): z.infer<typeof CritiqueOutputSchema>;
export declare function parseCritiqueResponse(raw: string): z.infer<typeof CritiqueResponseSchema>;
//# sourceMappingURL=review.d.ts.map