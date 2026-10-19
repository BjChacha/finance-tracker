import { z } from "zod";
import { ParseError } from "@/features/llm/chat";

const analysisItemSchema = z.object({
  title: z.string().trim().min(1).max(40),
  detail: z.string().trim().min(1).max(300),
});

/**
 * Contract for the model's analysis. Unknown keys are stripped by zod's default object mode, so a
 * chatty model cannot inject extra state; missing or oversized fields are rejected outright.
 */
export const reportAnalysisSchema = z.object({
  spendingStyle: z.string().trim().min(1).max(200),
  styleTags: z.array(z.string().trim().min(1).max(24)).min(1).max(6),
  insights: z.array(analysisItemSchema).min(1).max(5),
  suggestions: z.array(analysisItemSchema).min(1).max(5),
});

export type ReportAnalysis = z.infer<typeof reportAnalysisSchema>;
export type ReportAnalysisItem = ReportAnalysis["insights"][number];

const MAX_CONTENT_CHARACTERS = 32_768;

export function decodeReportAnalysis(content: string): ReportAnalysis {
  if (content.length > MAX_CONTENT_CHARACTERS)
    throw new ParseError(
      "invalid_response",
      "Model response exceeds the analysis contract limit",
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ParseError("invalid_response", "Model response is not valid JSON");
  }
  const result = reportAnalysisSchema.safeParse(parsed);
  if (!result.success)
    throw new ParseError(
      "invalid_response",
      "Model response does not match the analysis contract",
    );
  return result.data;
}
