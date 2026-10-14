import type { DonutSlice } from "./donut-data";

export const DONUT_CHART_HEIGHT = 208;
export const DONUT_OUTER_RADIUS = 60;
export const DONUT_INNER_RADIUS = 41;
export const DONUT_START_ANGLE = (160 * Math.PI) / 180;
export const DONUT_LABEL_MIN_GAP = 18;

const LABEL_FONT_SIZE = 12;
const LABEL_HEIGHT = 16;
const LABEL_EDGE_INSET = 4;
const LABEL_LINE_GAP = 4;
const LABEL_MAX_WIDTH = 90;
const LEADER_RADIAL_LENGTH = 10;

type LabelSide = "left" | "right";

type Point = {
	x: number;
	y: number;
};

type LabelSeed = {
	id: string;
	text: string;
	side: LabelSide;
	desiredY: number;
	textWidth: number;
	anchor: Point;
	elbow: Point;
};

export type DonutLabelLayout = {
	id: string;
	text: string;
	side: LabelSide;
	x: number;
	y: number;
	textAnchor: "start" | "end";
	linePoints: [Point, Point, Point];
	bounds: {
		left: number;
		right: number;
		top: number;
		bottom: number;
	};
};

type LayoutOptions = {
	width: number;
	height: number;
};

function estimateTextWidth(text: string): number {
	return Array.from(text).reduce((width, character) => {
		const isWide = (character.codePointAt(0) ?? 0) > 0xff;
		return width + (isWide ? LABEL_FONT_SIZE : LABEL_FONT_SIZE * 0.56);
	}, 0);
}

function fitLabelText(slice: DonutSlice): { text: string; width: number } {
	const suffix = ` ${slice.pct}%`;
	const characters = Array.from(slice.label);
	let text = `${slice.label}${suffix}`;

	while (characters.length > 1 && estimateTextWidth(text) > LABEL_MAX_WIDTH) {
		characters.pop();
		text = `${characters.join("")}…${suffix}`;
	}
	return { text, width: Math.min(estimateTextWidth(text), LABEL_MAX_WIDTH) };
}

function buildLabelSeeds(
	slices: DonutSlice[],
	options: LayoutOptions,
): LabelSeed[] {
	const total = slices.reduce((sum, slice) => sum + slice.value, 0);
	const centerX = options.width / 2;
	const centerY = options.height / 2;
	let accumulatedAngle = 0;

	return slices.map((slice) => {
		const sweepAngle = total > 0 ? (slice.value / total) * Math.PI * 2 : 0;
		const angle = DONUT_START_ANGLE + accumulatedAngle + sweepAngle / 2;
		const sine = Math.sin(angle);
		const cosine = Math.cos(angle);
		const fitted = fitLabelText(slice);
		accumulatedAngle += sweepAngle;

		return {
			id: slice.id,
			text: fitted.text,
			textWidth: fitted.width,
			side: sine >= 0 ? "right" : "left",
			desiredY: centerY - cosine * (DONUT_OUTER_RADIUS + LEADER_RADIAL_LENGTH),
			anchor: {
				x: centerX + sine * DONUT_OUTER_RADIUS,
				y: centerY - cosine * DONUT_OUTER_RADIUS,
			},
			elbow: {
				x: centerX + sine * (DONUT_OUTER_RADIUS + LEADER_RADIAL_LENGTH),
				y: centerY - cosine * (DONUT_OUTER_RADIUS + LEADER_RADIAL_LENGTH),
			},
		};
	});
}

function spreadLabels(
	seeds: LabelSeed[],
	height: number,
): Array<LabelSeed & { y: number }> {
	const top = LABEL_HEIGHT / 2 + 2;
	const bottom = height - LABEL_HEIGHT / 2 - 2;
	const sorted = [...seeds].sort(
		(left, right) => left.desiredY - right.desiredY,
	);
	if (sorted.length === 0) return [];

	let previousY = top - DONUT_LABEL_MIN_GAP;
	const positioned = sorted.map((seed) => {
		const y = Math.max(top, seed.desiredY, previousY + DONUT_LABEL_MIN_GAP);
		previousY = y;
		return { ...seed, y };
	});

	const lastY = positioned[positioned.length - 1].y;
	if (lastY <= bottom) return positioned;

	// Greedy chain overflows the bottom: shift the stack up, but only within the headroom
	// above the first label. The old code shifted everything by the full overflow, which
	// could push the topmost labels above y=0 where the SVG viewport clips them invisible
	// (leader line truncated, label text gone).
	const overflow = lastY - bottom;
	const headroom = positioned[0].y - top;
	const shift = Math.min(overflow, headroom);
	const shifted = positioned.map((seed) => ({ ...seed, y: seed.y - shift }));

	// Stack taller than the available span (more labels than min-gap spacing fits):
	// compress the gap evenly so every label stays inside the viewport. Overlapping
	// text beats an invisible label.
	const remaining = overflow - shift;
	if (remaining <= 0) return shifted;
	const compressedGap = (bottom - top) / (shifted.length - 1);
	return shifted.map((seed, index) => ({
		...seed,
		y: top + index * compressedGap,
	}));
}

function finalizeLabel(
	seed: LabelSeed & { y: number },
	width: number,
): DonutLabelLayout {
	const isLeft = seed.side === "left";
	const x = isLeft ? LABEL_EDGE_INSET : width - LABEL_EDGE_INSET;
	const left = isLeft ? x : x - seed.textWidth;
	const right = isLeft ? x + seed.textWidth : x;
	const lineEndX = isLeft ? right + LABEL_LINE_GAP : left - LABEL_LINE_GAP;

	return {
		id: seed.id,
		text: seed.text,
		side: seed.side,
		x,
		y: seed.y,
		textAnchor: isLeft ? "start" : "end",
		linePoints: [seed.anchor, seed.elbow, { x: lineEndX, y: seed.y }],
		bounds: {
			left,
			right,
			top: seed.y - LABEL_HEIGHT / 2,
			bottom: seed.y + LABEL_HEIGHT / 2,
		},
	};
}

export function layoutDonutLabels(
	slices: DonutSlice[],
	options: LayoutOptions,
): DonutLabelLayout[] {
	const seeds = buildLabelSeeds(slices, options);
	const left = spreadLabels(
		seeds.filter((seed) => seed.side === "left"),
		options.height,
	);
	const right = spreadLabels(
		seeds.filter((seed) => seed.side === "right"),
		options.height,
	);
	return [...left, ...right].map((seed) => finalizeLabel(seed, options.width));
}
