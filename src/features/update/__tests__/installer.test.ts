/**
 * findCachedApk 的缓存判定规则：中断的下载会留下半截文件，
 * 只按“文件存在”判断会让用户装到坏包（系统报「解析包时出现问题」）。
 */
jest.mock("expo-file-system", () => {
	const files: Record<string, { exists: boolean; size: number }> = {};
	return {
		Paths: { cache: "/cache" },
		File: class {
			constructor(_dir: string, name: string) {
				const entry = files[name] ?? { exists: false, size: 0 };
				this.exists = entry.exists;
				this.size = entry.size;
				this.uri = `file:///cache/${name}`;
			}
			exists: boolean;
			size: number;
			uri: string;
		},
		__setFile: (name: string, exists: boolean, size: number) => {
			files[name] = { exists, size };
		},
	};
});

jest.mock("expo-file-system/legacy", () => ({ getContentUriAsync: jest.fn() }));
jest.mock("expo-intent-launcher", () => ({ startActivityAsync: jest.fn() }));

import { Platform } from "react-native";

import { findCachedApk } from "../installer";

type MockFs = { __setFile: (name: string, exists: boolean, size: number) => void };
const fs = jest.requireMock("expo-file-system") as MockFs;

beforeAll(() => {
	Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });
});

describe("findCachedApk", () => {
	it("返回 URI when the cached size matches the release size", () => {
		fs.__setFile("finance-tracker-0.0.5.apk", true, 58077007);
		expect(findCachedApk({ version: "0.0.5", apkSize: 58077007 })).toBe(
			"file:///cache/finance-tracker-0.0.5.apk",
		);
	});

	it("拒绝截断的下载", () => {
		fs.__setFile("finance-tracker-0.0.6.apk", true, 1024);
		expect(findCachedApk({ version: "0.0.6", apkSize: 58077007 })).toBeNull();
	});

	it("没有缓存文件时返回 null", () => {
		expect(findCachedApk({ version: "0.0.7", apkSize: 58077007 })).toBeNull();
	});

	it("release 未给 size 时只要求文件非空", () => {
		fs.__setFile("finance-tracker-0.0.8.apk", true, 4096);
		expect(findCachedApk({ version: "0.0.8", apkSize: 0 })).toBe(
			"file:///cache/finance-tracker-0.0.8.apk",
		);
		fs.__setFile("finance-tracker-0.0.9.apk", true, 0);
		expect(findCachedApk({ version: "0.0.9", apkSize: 0 })).toBeNull();
	});
});
