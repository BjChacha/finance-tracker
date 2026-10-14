import type { TransactionType } from "@/db/schema";

export const TRANSACTION_TYPE_INDEX: Record<TransactionType, number> = {
	expense: 0,
	income: 1,
	transfer: 2,
};

export type TypeTransitionState = {
	id: number;
	from: TransactionType;
	to: TransactionType;
	direction: -1 | 1;
	phase: "preparing" | "animating";
	minHeight: number;
};

export function createTypeTransition(
	id: number,
	from: TransactionType,
	to: TransactionType,
	minHeight: number,
): TypeTransitionState {
	return {
		id,
		from,
		to,
		direction:
			TRANSACTION_TYPE_INDEX[to] > TRANSACTION_TYPE_INDEX[from] ? 1 : -1,
		phase: "preparing",
		minHeight: Math.max(0, minHeight),
	};
}

export function animateTypeTransition(
	transition: TypeTransitionState,
): TypeTransitionState {
	return { ...transition, phase: "animating" };
}

export function growTypeTransition(
	transition: TypeTransitionState,
	height: number,
): TypeTransitionState {
	return height > transition.minHeight
		? { ...transition, minHeight: height }
		: transition;
}

export function completeTypeTransitionState(
	transition: TypeTransitionState | null,
	transitionId: number,
): TypeTransitionState | null {
	if (transition?.id !== transitionId) return transition;
	return null;
}
