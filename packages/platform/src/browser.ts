/**
 * Chrome is required on every platform (PLAN.md section 3.5). On iOS every
 * browser uses Safari's engine, so Chrome there identifies itself as CriOS.
 */

export interface BrowserInfo {
  isChrome: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isMobile: boolean;
  name: string;
}

interface UADataLike {
  brands?: { brand: string; version: string }[];
  mobile?: boolean;
  platform?: string;
}

export function detectBrowser(userAgent: string, uaData?: UADataLike, maxTouchPoints = 0): BrowserInfo {
  // iPadOS reports a desktop Mac UA; touch support gives it away.
  const isIOS = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  const isAndroid = /Android/.test(userAgent);
  const isMobile = uaData?.mobile ?? (isIOS || isAndroid || /Mobi/.test(userAgent));

  if (isIOS) {
    const isChrome = /CriOS\//.test(userAgent);
    return { isChrome, isIOS, isAndroid, isMobile, name: isChrome ? 'Chrome (iOS)' : 'Safari or another iOS browser' };
  }

  if (uaData?.brands?.length) {
    // Drop GREASE entries such as "Not)A;Brand".
    const brands = uaData.brands.map((b) => b.brand).filter((b) => !/not.?a.?brand/i.test(b));
    const others = brands.filter((b) => b !== 'Chromium' && b !== 'Google Chrome');
    if (brands.includes('Google Chrome') && others.length === 0) {
      return { isChrome: true, isIOS, isAndroid, isMobile, name: 'Chrome' };
    }
    // Plain Chromium builds (including test browsers) behave like Chrome.
    if (brands.length === 1 && brands[0] === 'Chromium') {
      return { isChrome: true, isIOS, isAndroid, isMobile, name: 'Chromium' };
    }
    return { isChrome: false, isIOS, isAndroid, isMobile, name: others[0] ?? brands[0] ?? 'Unknown browser' };
  }

  // No UA client hints: Firefox, Safari, or an old browser.
  const name = /Firefox\//.test(userAgent) ? 'Firefox' : /Safari\//.test(userAgent) ? 'Safari' : 'Unknown browser';
  return { isChrome: false, isIOS, isAndroid, isMobile, name };
}

export function currentBrowser(): BrowserInfo {
  const nav = navigator as Navigator & { userAgentData?: UADataLike };
  return detectBrowser(nav.userAgent, nav.userAgentData, nav.maxTouchPoints);
}
