/** Static asset URLs; no runtime dependencies. */
export const primary = new URL('./svg/mimir-primary.svg', import.meta.url).href;
export const night = new URL('./svg/mimir-night.svg', import.meta.url).href;
export const mono = new URL('./svg/mimir-mono.svg', import.meta.url).href;
export const white = new URL('./svg/mimir-white.svg', import.meta.url).href;

export { defineMimirWordmark } from './interactive.mjs';
