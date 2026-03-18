import type { ModelReview, CritiqueOutput, CritiqueResponse, ReviewContext, TokenUsage } from "../types";
export interface ReviewRequest {
    context: ReviewContext;
    systemPrompt: string;
    userPrompt: string;
}
export interface CritiqueRequest {
    context: ReviewContext;
    otherModelReview: ModelReview;
    systemPrompt: string;
}
export interface CritiqueResponseRequest {
    context: ReviewContext;
    critique: CritiqueOutput;
    originalReview: ModelReview;
    systemPrompt: string;
}
export interface ModelClient {
    name: "anthropic" | "openai";
    review(req: ReviewRequest): Promise<{
        review: ModelReview;
        usage: TokenUsage;
    }>;
    critique(req: CritiqueRequest): Promise<{
        critique: CritiqueOutput;
        usage: TokenUsage;
    }>;
    respondToCritique(req: CritiqueResponseRequest): Promise<{
        response: CritiqueResponse;
        usage: TokenUsage;
    }>;
    chat(system: string, user: string): Promise<{
        text: string;
        usage: TokenUsage;
    }>;
}
//# sourceMappingURL=types.d.ts.map