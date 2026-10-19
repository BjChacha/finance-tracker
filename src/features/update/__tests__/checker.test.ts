import {
	deriveUpdateStatus,
	isUpdateDismissed,
	dismissUpdate,
} from '../hooks';
import {
	fetchLatestRelease,
	isNewer,
	parseLatestRelease,
	parseVersion,
} from '../checker';

const releasePayload = (overrides: Record<string, unknown> = {}) => ({
	tag_name: 'v0.0.2',
	name: 'v0.0.2',
	body: '- fix a\n- add b',
	published_at: '2026-01-02T03:04:05Z',
	assets: [
		{
			name: 'finance-tracker-0.0.2.apk',
			browser_download_url: 'https://github.com/x/y/releases/download/v0.0.2/finance-tracker-0.0.2.apk',
			size: 12345,
		},
	],
	...overrides,
});

describe('parseVersion', () => {
	it('accepts v-prefix and bare x.y.z', () => {
		expect(parseVersion('v0.0.2')).toEqual([0, 0, 2]);
		expect(parseVersion('0.1.2')).toEqual([0, 1, 2]);
		expect(parseVersion(' 1.2.3 ')).toEqual([1, 2, 3]);
	});

	it('rejects non-semver shapes', () => {
		expect(parseVersion('0.0.2-beta')).toBeNull();
		expect(parseVersion('0.0')).toBeNull();
		expect(parseVersion('main')).toBeNull();
		expect(parseVersion('')).toBeNull();
	});
});

describe('isNewer', () => {
	it('compares segment by segment', () => {
		expect(isNewer('0.0.2', '0.0.1')).toBe(true);
		expect(isNewer('v0.1.0', '0.0.99')).toBe(true);
		expect(isNewer('1.0.0', '0.9.9')).toBe(true);
		expect(isNewer('0.0.1', '0.0.1')).toBe(false);
		expect(isNewer('0.0.1', '0.0.2')).toBe(false);
	});

	it('never reports an update when either side is unparsable', () => {
		expect(isNewer('dev', '0.0.1')).toBe(false);
		expect(isNewer('0.0.2', '')).toBe(false);
	});
});

describe('parseLatestRelease', () => {
	it('extracts the apk download info', () => {
		const info = parseLatestRelease(releasePayload());
		expect(info.version).toBe('0.0.2');
		expect(info.tag).toBe('v0.0.2');
		expect(info.apkUrl).toContain('finance-tracker-0.0.2.apk');
		expect(info.apkSize).toBe(12345);
		expect(info.notes).toContain('fix a');
	});

	it('picks the first .apk asset among mixed assets', () => {
		const info = parseLatestRelease(
			releasePayload({
				assets: [
					{ name: 'notes.txt', browser_download_url: 'https://x/n.txt' },
					{ name: 'Finance-Tracker-0.0.2.APK', browser_download_url: 'https://x/a.apk', size: 1 },
				],
			}),
		);
		expect(info.apkUrl).toBe('https://x/a.apk');
	});

	it('throws when the tag is not semver or no apk asset exists', () => {
		expect(() => parseLatestRelease(releasePayload({ tag_name: 'nightly' }))).toThrow(/semver/);
		expect(() => parseLatestRelease(releasePayload({ assets: [] }))).toThrow(/no \.apk/);
		expect(() => parseLatestRelease('nope')).toThrow(/Malformed/);
	});
});

describe('fetchLatestRelease', () => {
	afterAll(() => {
		(globalThis as { fetch?: unknown }).fetch = undefined;
	});

	it('propagates non-2xx as an error', async () => {
		(globalThis as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 403,
		});
		await expect(fetchLatestRelease()).rejects.toThrow('403');
	});

	it('parses a successful response', async () => {
		(globalThis as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => releasePayload(),
		});
		await expect(fetchLatestRelease()).resolves.toMatchObject({ version: '0.0.2' });
	});
});

describe('deriveUpdateStatus', () => {
	it('maps query shape to ui states', () => {
		expect(deriveUpdateStatus({ isPending: true, isError: false })).toEqual({ state: 'checking' });
		expect(deriveUpdateStatus({ isPending: false, isError: true })).toEqual({ state: 'error' });
		expect(
			deriveUpdateStatus({
				isPending: false,
				isError: false,
				data: parseLatestRelease(releasePayload()),
			}),
		).toMatchObject({ state: 'available' });
	});
});

describe('dismissUpdate', () => {
	it('remembers the dismissed version for the session', () => {
		expect(isUpdateDismissed('9.9.9')).toBe(false);
		dismissUpdate('9.9.9');
		expect(isUpdateDismissed('9.9.9')).toBe(true);
		expect(isUpdateDismissed('9.9.8')).toBe(false);
		dismissUpdate('0.0.1'); // reset for other suites
		expect(isUpdateDismissed('9.9.9')).toBe(false);
	});
});
