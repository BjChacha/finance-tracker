/**
 * 颜色工具：把主题里的 6 位 hex 转成带透明度的 rgba。
 *
 * 主题只定义不透明外壳色，但「今天」这类高亮需要在不同主题下都保持克制，
 * 因此统一在这里派生，避免各页面各自手写 rgba 字符串。
 */
export function withAlpha(hex: string, alpha: number): string {
	const clamped = Math.min(1, Math.max(0, alpha));
	const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
	if (!match) return hex;
	const value = Number.parseInt(match[1]!, 16);
	const r = (value >> 16) & 0xff;
	const g = (value >> 8) & 0xff;
	const b = value & 0xff;
	return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}
