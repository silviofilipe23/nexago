import { detectPlatform } from './platform';

describe('detectPlatform', () => {
  it('manda iPhone para a App Store', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1';
    expect(detectPlatform({ userAgent: ua, maxTouchPoints: 5 })).toBe('ios');
  });

  it('manda Android para o Google Play', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36';
    expect(detectPlatform({ userAgent: ua, maxTouchPoints: 5 })).toBe('android');
  });

  it('reconhece iPad que se apresenta como Mac', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15';
    expect(detectPlatform({ userAgent: ua, maxTouchPoints: 5 })).toBe('ios');
  });

  it('trata Mac sem toque e Windows como desktop', () => {
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15';
    const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
    expect(detectPlatform({ userAgent: mac, maxTouchPoints: 0 })).toBe('desktop');
    expect(detectPlatform({ userAgent: win })).toBe('desktop');
  });
});
