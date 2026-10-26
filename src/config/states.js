// Bundled metadata keeps startup independent of state deployments. Remote
// metadata can extend these defaults when the map data hook loads the registry.
export const STATES = {
  nc: {
    code: 'nc',
    name: 'NC',
    fullName: 'North Carolina',
    // Folder under public/ where dashboard.json + school_coords.json live.
    dataDir: 'NC',
    // 2-digit state FIPS — used to filter the national counties topology
    // down to just this state's counties.
    fips: '37',
    // Attribution link shown in the map legend / footer for this state's
    // public health data source.
    sourceUrl: 'https://www.dph.ncdhhs.gov/programs/epidemiology/immunization/data/kindergarten-dashboard',
    sourceLabel: 'NC DHHS',
  },
  ca: {
    code: 'ca',
    name: 'CA',
    fullName: 'California',
    dataDir: 'CA',
    fips: '06',
    sourceUrl: 'https://www.cdph.ca.gov/Programs/CID/DCDC/Pages/Immunization/School/2023-2024-Kindergarten-Data.aspx',
    sourceLabel: 'CA CDPH',
  },
};

// Called during the map loading lifecycle, never during module import. A
// missing deployment falls back to the bundled metadata and CSVs. Return only
// usable remote sources so an unavailable metadata endpoint cannot strand a
// state on a broken remote URL.
export async function loadStateRegistry() {
  const base = import.meta.env.BASE_URL || '/';
  try {
    const response = await fetch(`${base}data/stateRegistry.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return {};
    const registry = await response.json();
    const entries = await Promise.all(Object.entries(registry).map(async ([code, baseUrl]) => {
      try {
        const response = await fetch(`${baseUrl}meta.json`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return null;
        const metadata = await response.json();
        const config = { ...STATES[code], ...metadata };
        if (config.code !== code || !/^\d{2}$/.test(config.fips) || !config.name) return null;
        STATES[code] = config;
        return [code, baseUrl];
      } catch {
        return null;
      }
    }));
    return Object.fromEntries(entries.filter(Boolean));
  } catch {
    return {};
  }
}

export const DEFAULT_STATE_CODE = 'nc';

export function getStateConfig(code) {
  const key = (code || DEFAULT_STATE_CODE).toLowerCase();
  return STATES[key] || STATES[DEFAULT_STATE_CODE];
}

// 2-digit state FIPS → USPS abbreviation for all 50 states + DC.
// Used by the national-view map to translate the FIPS id on each state
// feature into the lowercase state code expected by /state/<code> routing.
export const FIPS_TO_USPS = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY', '72': 'PR',
};

// Normalize a us-atlas state feature id (which may be a number or a
// numeric string with or without a leading zero) to a 2-digit FIPS string.
export function normalizeFips(id) {
  if (id == null) return '';
  return String(id).padStart(2, '0');
}

// Resolve a state feature id to the lowercase USPS code used by routing,
// e.g. 37 → "nc". Returns null when the FIPS isn't one of the 50 + DC.
export function fipsToUsps(id) {
  const fips = normalizeFips(id);
  const usps = FIPS_TO_USPS[fips];
  return usps ? usps.toLowerCase() : null;
}

// Inverse lookup: "nc" → "37". Returns null when the code isn't one of the
// 50 + DC + PR. Builds the inverse table lazily on first call.
let _USPS_TO_FIPS = null;
export function uspsToFips(code) {
  if (!code) return null;
  if (!_USPS_TO_FIPS) {
    _USPS_TO_FIPS = {};
    Object.keys(FIPS_TO_USPS).forEach(fips => {
      _USPS_TO_FIPS[FIPS_TO_USPS[fips].toLowerCase()] = fips;
    });
  }
  return _USPS_TO_FIPS[String(code).toLowerCase()] || null;
}
