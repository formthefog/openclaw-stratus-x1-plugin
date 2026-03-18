import type { CodeContext } from "./types";
export declare function analyzeCodebase(keywords: string[], maxFiles?: number): Promise<CodeContext>;
export declare function extractKeywords(title: string, body: string): string[];
