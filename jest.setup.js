/**
 * Jest 全局测试环境：
 * - 强制 NODE_ENV=test（避免宿主 shell 的 NODE_ENV=production 让 reanimated
 *   误判非 jest 环境、并让 react-test-renderer 走 production 构建而丢失 act）
 * - react-native-gesture-handler 官方 mock（手势组件在测试中渲染为普通 View）
 * - react-native-worklets 官方 mock（Reanimated 4 官方测试指引：只 mock worklets，
 *   Reanimated 本体在 IS_JEST 模式下走 web-like 实现）
 * - reanimated 测试工具（toHaveAnimatedStyle 等 matcher）
 */
process.env.NODE_ENV = "test";

jest.mock("react-native-worklets", () =>
	require("react-native-worklets/lib/module/mock"),
);
jest.mock(
	"react-native-safe-area-context",
	() => require("react-native-safe-area-context/jest/mock").default,
);
// 组件测试会经 @/theme → @/db/settings 拉入 expo-sqlite（原生模块在 Jest 不可用）：
// 全局桩掉 settings；各 db 测试文件自身的 jest.mock 优先级更高，不受影响。
jest.mock("@/db/settings", () => ({
	getSetting: jest.fn(async () => null),
	getSettingSync: jest.fn(() => null),
	setSetting: jest.fn(async () => {}),
}));
require("react-native-gesture-handler/jestSetup");
require("react-native-reanimated").setUpTests();
