import { describe, it, expect } from 'vitest';
import {
  STATES,
  loadStateRegistry,
  DEFAULT_STATE_CODE,
  getStateConfig,
  FIPS_TO_USPS,
  fipsToUsps,
  uspsToFips,
  normalizeFips,
} from './states.js';

describe('remote state metadata', () => {
  const bundledNc = STATES.nc;
  const remoteBase = 'https://example.test/nc/';

  afterEach(() => {
    STATES.nc = bundledNc;
    vi.unstubAllGlobals();
  });

  it.each(['404', 'network failure', 'invalid JSON'])('keeps bundled metadata after %s', async (failure) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ nc: remoteBase }) });
    if (failure === '404') fetchMock.mockResolvedValueOnce({ ok: false });
    if (failure === 'network failure') fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    if (failure === 'invalid JSON') fetchMock.mockResolvedValueOnce({
      ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); },
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await loadStateRegistry()).toEqual({});
    expect(getStateConfig('nc')).toBe(bundledNc);
    expect(getStateConfig('ca').fips).toBe('06');
  });

  it('keeps remote sources working when metadata is available', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ nc: remoteBase }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...bundledNc, sourceLabel: 'Remote source' }) }));

    expect(await loadStateRegistry()).toEqual({ nc: remoteBase });
    expect(getStateConfig('nc').sourceLabel).toBe('Remote source');
  });

  it('keeps bundled states available when the registry cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await loadStateRegistry()).toEqual({});
    expect(getStateConfig('nc')).toBe(bundledNc);
  });
});

describe('STATES registry', () => {
  it('includes NC by default', () => {
    expect(STATES.nc).toBeDefined();
    expect(STATES.nc.code).toBe('nc');
    expect(STATES.nc.fips).toBe('37');
    expect(STATES.nc.dataDir).toBe('NC');
  });

  it('every entry has the required fields', () => {
    for (const [code, cfg] of Object.entries(STATES)) {
      expect(cfg.code).toBe(code);
      expect(cfg.name).toBeTruthy();
      expect(cfg.fullName).toBeTruthy();
      expect(cfg.dataDir).toBeTruthy();
      expect(cfg.fips).toMatch(/^\d{2}$/);
      expect(cfg.sourceUrl).toMatch(/^https?:\/\//);
      expect(cfg.sourceLabel).toBeTruthy();
    }
  });
});

describe('DEFAULT_STATE_CODE', () => {
  it('defaults to NC for backward compatibility', () => {
    expect(DEFAULT_STATE_CODE).toBe('nc');
  });
});

describe('getStateConfig', () => {
  it('returns the NC config when given "nc"', () => {
    expect(getStateConfig('nc')).toBe(STATES.nc);
  });

  it('is case-insensitive', () => {
    expect(getStateConfig('NC')).toBe(STATES.nc);
    expect(getStateConfig('Nc')).toBe(STATES.nc);
  });

  it('falls back to the default state for unknown codes', () => {
    expect(getStateConfig('zz')).toBe(STATES[DEFAULT_STATE_CODE]);
  });

  it('falls back to the default state for missing args', () => {
    expect(getStateConfig()).toBe(STATES[DEFAULT_STATE_CODE]);
    expect(getStateConfig(null)).toBe(STATES[DEFAULT_STATE_CODE]);
    expect(getStateConfig('')).toBe(STATES[DEFAULT_STATE_CODE]);
  });
});

describe('FIPS_TO_USPS', () => {
  it('covers 50 states + DC + PR', () => {
    expect(Object.keys(FIPS_TO_USPS).length).toBe(52);
  });

  it('maps NC FIPS 37 → "NC"', () => {
    expect(FIPS_TO_USPS['37']).toBe('NC');
  });

  it('maps DC FIPS 11 → "DC"', () => {
    expect(FIPS_TO_USPS['11']).toBe('DC');
  });

  it('maps PR FIPS 72 → "PR"', () => {
    expect(FIPS_TO_USPS['72']).toBe('PR');
  });

  it('uses 2-digit zero-padded FIPS strings as keys', () => {
    expect(FIPS_TO_USPS['01']).toBe('AL');
    expect(FIPS_TO_USPS['1']).toBeUndefined();
  });
});

describe('normalizeFips', () => {
  it('zero-pads single-digit numeric ids', () => {
    expect(normalizeFips(1)).toBe('01');
    expect(normalizeFips('1')).toBe('01');
  });

  it('leaves already 2-digit ids untouched', () => {
    expect(normalizeFips(37)).toBe('37');
    expect(normalizeFips('37')).toBe('37');
  });

  it('returns an empty string for nullish input', () => {
    expect(normalizeFips(null)).toBe('');
    expect(normalizeFips(undefined)).toBe('');
  });
});

describe('fipsToUsps', () => {
  it('returns the lowercase USPS code for known FIPS', () => {
    expect(fipsToUsps('37')).toBe('nc');
    expect(fipsToUsps(37)).toBe('nc');
    expect(fipsToUsps('06')).toBe('ca');
    expect(fipsToUsps(6)).toBe('ca');
  });

  it('returns null for FIPS codes outside the 50 + DC + PR set', () => {
    expect(fipsToUsps('99')).toBeNull();
    expect(fipsToUsps(null)).toBeNull();
  });

  it('returns "pr" for Puerto Rico FIPS 72', () => {
    expect(fipsToUsps('72')).toBe('pr');
  });
});

describe('uspsToFips', () => {
  it('returns the zero-padded FIPS for known USPS codes', () => {
    expect(uspsToFips('nc')).toBe('37');
    expect(uspsToFips('NC')).toBe('37');
    expect(uspsToFips('ca')).toBe('06');
    expect(uspsToFips('al')).toBe('01');
  });

  it('returns null for unknown / missing codes', () => {
    expect(uspsToFips('zz')).toBeNull();
    expect(uspsToFips('')).toBeNull();
    expect(uspsToFips(null)).toBeNull();
    expect(uspsToFips(undefined)).toBeNull();
  });
});
