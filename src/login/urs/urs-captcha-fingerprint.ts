import { randomInt } from 'node:crypto';
import { createFingerprintEncoder, type CaptchaFingerprintPayload } from './urs-captcha-fingerprint-crypto.ts';

export interface CaptchaFingerprintResult {
  fingerprint: string;
  expiresAt: number;
  collectorAvailable: boolean;
}

export type CaptchaCollectorResult =
  | { available: true; hashes: readonly [string, string]; instrumentationCode?: string }
  | { available: false; instrumentationCode?: string };

const NONCE_ALPHABET = 'aZbY0cXdW1eVf2Ug3Th4SiR5jQk6PlO7mNn8MoL9pKqJrIsHtGuFvEwDxCyBzA';
function nonce(): string {
  return Array.from({ length: 3 }, () => NONCE_ALPHABET[randomInt(NONCE_ALPHABET.length)]).join('');
}

/**
 * Pure module48 payload constructor. Collector values must reflect actual runtime.
 * This encodes an honest environment report; it never asserts captcha acceptance.
 * host is the actual current protocol target host, supplied by the transport caller.
 */
export function createCaptchaFingerprint(options: {
  host: string;
  collector: CaptchaCollectorResult;
  now?: number;
}): CaptchaFingerprintResult {
  if (!options.host || /[\\/'"\s]/.test(options.host)) throw new Error('Invalid captcha fingerprint host');
  const now = options.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error('Invalid captcha fingerprint time');
  const expiresAt = now + 900_000;
  const payload: CaptchaFingerprintPayload = {
    v: 'v1.1',
    h: options.host,
    u: `${nonce()}${expiresAt}${nonce()}`,
    fp: options.collector.available ? options.collector.hashes.join(',') : '0000000000',
  };
  if (!options.collector.available) payload.ec = '1';
  if (options.collector.instrumentationCode) payload.icp = options.collector.instrumentationCode;
  return {
    fingerprint: createFingerprintEncoder()(payload, expiresAt),
    expiresAt,
    collectorAvailable: options.collector.available,
  };
}

/**
 * Node has no browser window/renderer collector. Report the official collector
 * failure branch (ec=1), plus missing-window instrumentation code 0000. No
 * navigator/Canvas/plugin values are fabricated. Server acceptance is untested.
 */
export function createNativeCaptchaFingerprint(host: string): CaptchaFingerprintResult {
  return createCaptchaFingerprint({
    host,
    collector: { available: false, instrumentationCode: '0000' },
  });
}
