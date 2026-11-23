import { describe, expect, it } from 'vitest';
import { detectBrowser } from './platform';

const ua = {
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};

describe('detectBrowser', () => {
  it('recognises the common browsers', () => {
    expect(detectBrowser(ua.edge, 'Win32', 0)).toBe('edge');
    expect(detectBrowser(ua.chrome, 'Win32', 0)).toBe('chrome');
    expect(detectBrowser(ua.firefox, 'Win32', 0)).toBe('firefox');
    expect(detectBrowser(ua.iphone, 'iPhone', 5)).toBe('safari-ios');
    expect(detectBrowser(ua.iphoneChrome, 'iPhone', 5)).toBe('safari-ios');
    expect(detectBrowser(ua.mac, 'MacIntel', 0)).toBe('safari-mac');
    // iPad with desktop user agent
    expect(detectBrowser(ua.mac, 'MacIntel', 5)).toBe('safari-ios');
  });
});
