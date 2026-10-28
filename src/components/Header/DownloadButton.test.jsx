import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DownloadButton from './DownloadButton.jsx';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DownloadButton', () => {
  it('fetches every registered API for a national download', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ nc: 'https://example.test/nc/', ca: 'https://example.test/ca/' }) })
      .mockResolvedValue({ ok: true, text: async () => 'school_id,county\n1,Wake County\n' }));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<DownloadButton zoomLevel="national" />);
    await user.click(screen.getByRole('button', { name: 'Download all schools (CSV)' }));
    expect(fetch).toHaveBeenCalledWith('/data/stateRegistry.json');
    expect(fetch).toHaveBeenCalledWith(new URL('data/schools.csv', 'https://example.test/ca/'));
    expect(fetch).toHaveBeenCalledWith(new URL('data/schools.csv', 'https://example.test/nc/'));
  });

  it('fetches the selected state API for a state download', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ca: 'https://example.test/ca/' }) })
      .mockResolvedValueOnce({ ok: true, text: async () => 'school_id,county\n1,Los Angeles County\n' }));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<DownloadButton zoomLevel="state" stateCode="ca" />);
    await user.click(screen.getByRole('button', { name: 'Download CA schools (CSV)' }));
    expect(fetch).toHaveBeenCalledWith(new URL('data/schools.csv', 'https://example.test/ca/'));
  });

  it('supports county downloads and labels them with the county name', () => {
    render(<DownloadButton zoomLevel="county" stateCode="ca" countySlug="los-angeles" />);
    expect(screen.getByRole('button', { name: 'Download los angeles schools (CSV)' })).toBeInTheDocument();
  });

  it('renders nothing when the resolution lacks the data it needs', () => {
    // state view with no state code, county view missing the county slug
    const { container: c1 } = render(<DownloadButton zoomLevel="state" />);
    expect(c1.firstChild).toBeNull();
    const { container: c2 } = render(<DownloadButton zoomLevel="county" stateCode="ca" />);
    expect(c2.firstChild).toBeNull();
  });
});
