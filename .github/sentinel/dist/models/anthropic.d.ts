import type { ModelClient, ReviewRequest, CritiqueRequest, CritiqueResponseRequest } from "./types";
import type { ModelReview, CritiqueOutput, CritiqueResponse, TokenUsage } from "../types";
export declare class AnthropicClient implements ModelClient {
    name: "anthropic";
    private client;
    private model;
    constructor(apiKey: string, model: string);
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
    private call;
}
//# sourceMappingURL=anthropic.d.ts.map