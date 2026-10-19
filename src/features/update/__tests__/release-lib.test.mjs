import {
  apkAssetName,
  applyBump,
  deriveNotes,
  nextPatchVersion,
  parseArgs,
  planBump,
} from '../../../../scripts/release-lib.mjs';

const appJson = () => ({
  expo: {
    name: '花哪了',
    slug: 'finance-tracker',
    version: '0.0.1',
    android: { package: 'com.anonymous.financetracker', versionCode: 1 },
  },
});
const pkgJson = () => ({ name: 'finance-tracker', version: '0.0.1' });
const defaults = () => ({ version: null, notes: null, prerelease: false, skipBump: false, dryRun: false });

describe('parseArgs', () => {
  it('parses flags and values', () => {
    expect(parseArgs(['--version', '0.2.0', '--notes', 'hello world', '--prerelease'])).toEqual({
      ...defaults(),
      version: '0.2.0',
      notes: 'hello world',
      prerelease: true,
    });
    expect(parseArgs(['--skip-bump', '--dry-run'])).toEqual({ ...defaults(), skipBump: true, dryRun: true });
  });

  it('rejects unknown flags and non-semver versions', () => {
    expect(() => parseArgs(['--oops'])).toThrow(/Unknown argument/);
    expect(() => parseArgs(['--version', '1.2'])).toThrow(/x\.y\.z/);
  });
});

describe('nextPatchVersion', () => {
  it('bumps the patch segment', () => {
    expect(nextPatchVersion('0.0.1')).toBe('0.0.2');
    expect(nextPatchVersion('1.2.9')).toBe('1.2.10');
  });
  it('rejects non-semver input', () => {
    expect(() => nextPatchVersion('v0.0.1')).toThrow();
    expect(() => nextPatchVersion('dev')).toThrow();
  });
});

describe('planBump', () => {
  it('patches by default and increments versionCode', () => {
    expect(planBump(appJson(), pkgJson(), defaults())).toEqual({
      current: '0.0.1',
      nextVersion: '0.0.2',
      nextVersionCode: 2,
      tagName: 'v0.0.2',
    });
  });

  it('honors an explicit --version and treats missing versionCode as 1', () => {
    const app = appJson();
    delete app.expo.android.versionCode;
    expect(planBump(app, pkgJson(), { ...defaults(), version: '0.9.0' })).toMatchObject({
      nextVersion: '0.9.0',
      nextVersionCode: 2,
    });
  });

  it('skip-bump keeps version and code (retry scenario)', () => {
    expect(
      planBump(appJson(), pkgJson(), { ...defaults(), skipBump: true }),
    ).toMatchObject({ nextVersion: '0.0.1', nextVersionCode: 1, tagName: 'v0.0.1' });
  });

  it('refuses to release the same version', () => {
    expect(() => planBump(appJson(), pkgJson(), { ...defaults(), version: '0.0.1' })).toThrow(/equals/);
  });
});

describe('applyBump', () => {
  it('writes the plan into both json payloads', () => {
    const app = appJson();
    const pkg = pkgJson();
    applyBump(app, pkg, { current: '0.0.1', nextVersion: '0.1.0', nextVersionCode: 2, tagName: 'v0.1.0' });
    expect(app.expo.version).toBe('0.1.0');
    expect(app.expo.android.versionCode).toBe(2);
    expect(pkg.version).toBe('0.1.0');
  });

  it('creates the android section when absent', () => {
    const app = appJson();
    delete app.expo.android;
    applyBump(app, pkgJson(), { current: '0.0.1', nextVersion: '0.1.0', nextVersionCode: 2, tagName: 'v0.1.0' });
    expect(app.expo.android.versionCode).toBe(2);
  });
});

describe('apkAssetName', () => {
  it('matches the copy-apk.mjs naming scheme', () => {
    expect(apkAssetName(appJson())).toBe('finance-tracker-0.0.1.apk');
  });
});

describe('deriveNotes', () => {
  it('prefers explicit notes', () => {
    expect(deriveNotes('0.0.2', 'manual', 'a\nb')).toBe('manual');
  });
  it('falls back to commit log, then a plain line', () => {
    expect(deriveNotes('0.0.2', null, ' a\nb ')).toBe('a\nb');
    expect(deriveNotes('0.0.2', null, '')).toBe('Release v0.0.2');
    expect(deriveNotes('0.0.2', '   ', null)).toBe('Release v0.0.2');
  });
});
