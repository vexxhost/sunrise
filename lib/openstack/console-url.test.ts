import { describe, expect, it } from 'vitest';

import { rewriteNoVncUrl } from '@/lib/openstack/console-url';

describe('noVNC console URL rewriting', () => {
  it('preserves Nova token data and adds the dashboard origin', () => {
    const result = rewriteNoVncUrl(
      'https://console.example/vnc_lite.html?path=websockify%3Ftoken%3Dsecret',
      'https://cloud.example/compute',
    );
    const url = new URL(result);

    expect(url.pathname).toBe('/sunrise.html');
    expect(url.searchParams.get('path')).toBe('websockify?token=secret');
    expect(url.searchParams.get('parentOrigin')).toBe('https://cloud.example');
  });

  it('supports the upstream full noVNC page name', () => {
    expect(
      rewriteNoVncUrl('https://console.example/novnc/vnc.html?token=abc'),
    ).toBe('https://console.example/novnc/sunrise.html?token=abc');
  });

  it('leaves unrelated and malformed URLs unchanged', () => {
    expect(rewriteNoVncUrl('https://console.example/serial.html?token=abc')).toBe(
      'https://console.example/serial.html?token=abc',
    );
    expect(rewriteNoVncUrl('not a URL')).toBe('not a URL');
  });

  it('ignores invalid dashboard URLs without dropping the console URL', () => {
    expect(
      rewriteNoVncUrl('https://console.example/vnc.html?token=abc', '/relative'),
    ).toBe('https://console.example/sunrise.html?token=abc');
  });
});
