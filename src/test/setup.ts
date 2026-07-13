import '@testing-library/jest-dom/vitest'

// jsdom does not implement matchMedia. Components that read viewport/media
// preferences (e.g. usePrefersReducedMotion, useMediaQuery) call
// window.matchMedia at render time, so without this stub any test that
// mounts them throws "matchMedia is not a function".
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList
}
