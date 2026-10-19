import { withAlpha } from '../color';

describe('withAlpha', () => {
	it('derives rgba from theme hex colors', () => {
		expect(withAlpha('#F59E0B', 0.12)).toBe('rgba(245, 158, 11, 0.12)');
		expect(withAlpha('#000000', 1)).toBe('rgba(0, 0, 0, 1)');
	});

	it('clamps alpha into the 0..1 range', () => {
		expect(withAlpha('#FFFFFF', 2)).toBe('rgba(255, 255, 255, 1)');
		expect(withAlpha('#FFFFFF', -1)).toBe('rgba(255, 255, 255, 0)');
	});

	it('passes non 6-digit-hex input through unchanged', () => {
		expect(withAlpha('red', 0.5)).toBe('red');
		expect(withAlpha('#FFF', 0.5)).toBe('#FFF');
	});
});
