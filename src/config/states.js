// State metadata used to drive the state-parameterized view.
//
// The dashboard renders one US state at a time. The choice of state is
// driven by a state code (lowercase, e.g. "nc"). All state-specific values
// — display name, data folder, county FIPS prefix, and external attribution
// links — live in the state specific repository at meta.json.

// Load state metadata from each state's deployment. Top-level await ensures
// consumers see a complete registry when this module is imported.
const base =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.BASE_URL) ||
  "/";
const registryResponse = await fetch(`${base}data/stateRegistry.json`);
const stateRegistry = await registryResponse.json();

export const STATES = Object.fromEntries(
  await Promise.all(
    Object.entries(stateRegistry).map(async ([stateCode, baseUrl]) => {
      const response = await fetch(`${baseUrl}data/meta.json`);
      if (!response.ok) {
        throw new Error(
          `Unable to load metadata for ${stateCode} (${response.status})`,
        );
      }
      return [stateCode, await response.json()];
    }),
  ),
);

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
