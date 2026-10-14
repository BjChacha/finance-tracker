import {
	animateTypeTransition,
	completeTypeTransitionState,
	createTypeTransition,
	growTypeTransition,
} from "../transaction-type-transition";

describe("transaction type transition", () => {
	it("compresses adjacent and distant targets to one directional page", () => {
		expect(createTypeTransition(1, "expense", "income", 400).direction).toBe(
			1,
		);
		expect(
			createTypeTransition(2, "expense", "transfer", 400).direction,
		).toBe(1);
		expect(createTypeTransition(3, "transfer", "income", 400).direction).toBe(
			-1,
		);
	});

	it("promotes a prepared transition without changing its identity", () => {
		const prepared = createTypeTransition(4, "expense", "transfer", 420);
		expect(animateTypeTransition(prepared)).toEqual({
			...prepared,
			phase: "animating",
		});
	});

	it("lets the latest rapid intent ignore stale completion", () => {
		const first = animateTypeTransition(
			createTypeTransition(5, "expense", "income", 400),
		);
		const latest = animateTypeTransition(
			createTypeTransition(6, "income", "transfer", first.minHeight),
		);

		expect(completeTypeTransitionState(latest, first.id)).toBe(latest);
		expect(completeTypeTransitionState(latest, latest.id)).toBeNull();
	});

	it("keeps the tallest page mounted for the transition lifetime", () => {
		const transition = createTypeTransition(7, "transfer", "expense", 500);
		expect(growTypeTransition(transition, 420)).toBe(transition);
		expect(growTypeTransition(transition, 640).minHeight).toBe(640);
	});
});
