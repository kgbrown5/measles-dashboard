// Shared by the browser and the endpoint monitor: check the URLs we actually load.
export const DATASET_FILES = ['state.csv', 'counties.csv', 'schools.csv'];

export function dataUrl(entry, file) {
  const base = typeof entry === 'string' ? entry : entry?.base_url;
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Registry base_url must be an HTTPS URL without credentials, query, or fragment.');
  }
  const path = typeof entry === 'string' ? 'data' : (entry.dataset_path ?? 'data');
  if (!['.', '', 'data', 'data/'].includes(path)) {
    throw new Error('Registry dataset_path must be . or data/.');
  }
  return new URL(`${path === '.' || path === '' ? '' : 'data/'}${file}`, `${base.replace(/\/$/, '')}/`).href;
}
