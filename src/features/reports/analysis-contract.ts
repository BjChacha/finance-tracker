import { z } from "zod";
import { ParseError } from "@/features/llm/chat";

/**
 * Bump whenever the stored analysis shape changes. Rows with an older version are treated as
 * missing so the scheduler regenerates them instead of rendering a half-supported payload.
 */
export const REPORT_ANALYSIS_VERSION = 2;

/**
 * The consumer-value vocabulary the model may pick from. Rendering maps these ids to icons and
 * accent colors, so the model never controls layout.
 */
export const REPORT_VALUE_IDS = [
	"self_care",
	"social",
	"growth",
	"efficiency",
	"comfort",
	"curiosity",
] as const;

export type ReportValueId = (typeof REPORT_VALUE_IDS)[number];

const itemSchema = z.object({
	title: z.string().trim().min(1).max(20),
	action: z.string().trim().min(1).max(160),
	target: z.string().trim().min(1).max(30),
	impact: z.string().trim().min(1).max(60),
});

/**
 * Contract for the model's analysis, version 2.
 *
 * The report is framed around how spending feels and what it says about the reader's values,
 * while every claim must be traceable to the snapshot numbers. Unknown keys are stripped by
 * zod's default object mode; missing or oversized fields are rejected outright.
 */
export const reportAnalysisSchema = z.object({
	headline: z.string().trim().min(1).max(40),
	mood: z.object({
		label: z.string().trim().min(1).max(12),
		/** 1 = 紧绷, 5 = 松弛满足 */
		score: z.number().int().min(1).max(5),
		narrative: z.string().trim().min(1).max(160),
	}),
	values: z
		.array(
			z.object({
				id: z.enum(REPORT_VALUE_IDS),
				label: z.string().trim().min(1).max(16),
				narrative: z.string().trim().min(1).max(120),
			}),
		)
		.min(1)
		.max(4),
	dataPoints: z
		.array(
			z.object({
				label: z.string().trim().min(1).max(16),
				value: z.string().trim().min(1).max(24),
				note: z.string().trim().min(1).max(80),
			}),
		)
		.min(2)
		.max(5),
	categoryStories: z
		.array(
			z.object({
				category: z.string().trim().min(1).max(16),
				emotion: z.string().trim().min(1).max(24),
				note: z.string().trim().min(1).max(120),
			}),
		)
		.max(5),
	suggestions: z.array(itemSchema).min(1).max(4),
	/** Estimated monthly savings if every suggestion were followed. */
	savingPotentialYuan: z.number().min(0).max(1_000_000),
});

export type ReportAnalysis = z.infer<typeof reportAnalysisSchema>;
export type ReportAnalysisItem = ReportAnalysis["suggestions"][number];
export type ReportValue = ReportAnalysis["values"][number];

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
