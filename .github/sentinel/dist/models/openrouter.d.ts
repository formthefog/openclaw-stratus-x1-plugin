import type { ModelClient, ReviewRequest, CritiqueRequest, CritiqueResponseRequest } from "./types";
import type { ModelReview, CritiqueOutput, CritiqueResponse, TokenUsage } from "../types";
type ClientRole = "anthropic" | "openai";
export declare class OpenRouterClient implements ModelClient {
    name: ClientRole;
    private client;
    private model;
    private role;
    constructor(apiKey: string, model: string, role: ClientRole);
    private get reviewSystem();
    private get critiqueSystem();
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
export {};
//# sourceMappingURL=openrouter.d.ts.map