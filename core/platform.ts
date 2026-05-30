/**
 * platform.ts — T10: Platform Abstraction Layer (PAL)
 *
 * All pure computation modules (spatial/, temporal/, risk-engine/,
 * simulation/) import only from core/ and spatial/ — never from
 * lib/, components/, or browser globals.
 *
 * The PAL is the only interface they use for time, logging, and haptics.
 * This contract enables WASM / React Native extraction of PerceptaKernel.
 */

export interface PerceptaPlatform {
  /** High-resolution monotonic clock (milliseconds) */
  now(): number;
  /** Log a diagnostic message */
  log(level: 'debug' | 'info' | 'warn' | 'error', msg: string, data?: unknown): void;
  /** Emit a haptic pulse pattern (durations in ms). No-op on platforms without haptics. */
  haptic(pattern: number[]): void;
}

/** Browser platform: uses performance.now(), console, and Vibration API. */
export const BrowserPlatform: PerceptaPlatform = {
  now:    () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  log:    (level, msg, data) => console[level](`[Percepta] ${msg}`, ...(data !== undefined ? [data] : [])),
  haptic: (pattern) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  },
};

/** No-op platform: for WASM / server-side / test environments. */
export const NullPlatform: PerceptaPlatform = {
  now:    () => Date.now(),
  log:    () => {},
  haptic: () => {},
};
