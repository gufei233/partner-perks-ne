/** Offline implementation of the official URS VDF_FUNCTION worker contract. */
export interface UrsVdfChallenge {
  hashFunc: 'VDF_FUNCTION';
  sid: string;
  minTime: number;
  maxTime: number;
  args: { puzzle: string; mod: string; x: string; t: number | string };
}

/** Pass this object as pVParam; args alone is the nested JSON string. */
export interface UrsPowerParam {
  puzzle: string;
  spendTime: number;
  runTimes: number;
  sid: string;
  args: string;
}

export interface UrsVdfOptions {
  /** Defaults to Date.now. Test clocks must be monotonic integer milliseconds. */
  now?: () => number;
  /** Reject oversized server budgets instead of silently changing their timing. */
  maxAcceptedTimeMs?: number;
  maxIterations?: number;
  maxHexDigits?: number;
}

/** The SDK's powSign: MurmurHash3 x86 32-bit over low bytes of JS characters. */
export function powSign(key: string, seed: number): number {
  let hash = seed | 0;
  const end = key.length - (key.length & 3);
  const mix = (word: number): number => {
    word = Math.imul(word, 0xcc9e2d51);
    word = (word << 15) | (word >>> 17);
    return Math.imul(word, 0x1b873593);
  };
  for (let i = 0; i < end; i += 4) {
    const word = (key.charCodeAt(i) & 0xff)
      | ((key.charCodeAt(i + 1) & 0xff) << 8)
      | ((key.charCodeAt(i + 2) & 0xff) << 16)
      | ((key.charCodeAt(i + 3) & 0xff) << 24);
    hash ^= mix(word);
    hash = (hash << 13) | (hash >>> 19);
    hash = (Math.imul(hash, 5) + 0xe6546b64) | 0;
  }
  let tail = 0;
  for (let i = key.length - 1; i >= end; i--) {
    tail = (tail << 8) | (key.charCodeAt(i) & 0xff);
  }
  if (key.length !== end) hash ^= mix(tail);
  hash ^= key.length;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Format the measured result exactly as onPowerDone passes it to sms/sm. */
export function createVdfPowerParam(
  challenge: Pick<UrsVdfChallenge, 'sid' | 'args'>,
  xHex: string,
  runTimes: number,
  spendTime: number,
): UrsPowerParam {
  if (!/^[0-9a-f]+$/.test(xHex)
    || !Number.isSafeInteger(runTimes) || runTimes < 0
    || !Number.isSafeInteger(spendTime) || spendTime < 0) {
    throw new Error('Invalid VDF result shape');
  }
  const signObj = { runTimes, spendTime, t: runTimes, x: xHex };
  const encoded = (['runTimes', 'spendTime', 't', 'x'] as const)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(signObj[key])}`)
    .join('&');
  const sign = powSign(encoded, runTimes);
  return {
    puzzle: challenge.args.puzzle,
    spendTime,
    runTimes,
    sid: challenge.sid,
    args: JSON.stringify({ x: xHex, t: runTimes, sign }),
  };
}

/**
 * Compute the official worker's repeated squaring using exact native BigInt.
 * Continue until both t iterations and minTime are met; break only after a
 * squaring step takes elapsed time beyond maxTime, as the official worker does.
 * This CPU routine is synchronous: callers may run it in a worker thread.
 * Only actual elapsed time is signed; no HAR challenge or credential is reused.
 */
export function calculateVdf(
  challenge: UrsVdfChallenge,
  options: UrsVdfOptions = {},
): UrsPowerParam {
  const maxAcceptedTimeMs = options.maxAcceptedTimeMs ?? 30_000;
  const maxIterations = options.maxIterations ?? 10_000_000;
  const maxHexDigits = options.maxHexDigits ?? 1024;
  if (!Number.isSafeInteger(maxAcceptedTimeMs) || maxAcceptedTimeMs < 0
    || !Number.isSafeInteger(maxIterations) || maxIterations < 1
    || !Number.isSafeInteger(maxHexDigits) || maxHexDigits < 1) {
    throw new Error('Invalid VDF resource limits');
  }
  if (challenge?.hashFunc !== 'VDF_FUNCTION'
    || typeof challenge.sid !== 'string' || !challenge.sid
    || typeof challenge.args?.puzzle !== 'string' || !challenge.args.puzzle
    || !Number.isSafeInteger(challenge.minTime) || challenge.minTime < 0
    || !Number.isSafeInteger(challenge.maxTime) || challenge.maxTime < challenge.minTime
    || challenge.maxTime > maxAcceptedTimeMs) {
    throw new Error('Unsupported VDF challenge or time budget');
  }
  const iterations = typeof challenge.args.t === 'string'
    && /^\d+$/.test(challenge.args.t)
    ? Number(challenge.args.t)
    : challenge.args.t;
  if (typeof iterations !== 'number' || !Number.isSafeInteger(iterations) || iterations < 0) {
    throw new Error('Invalid VDF iteration count');
  }
  for (const hex of [challenge.args.x, challenge.args.mod]) {
    if (typeof hex !== 'string' || !/^[0-9a-f]+$/i.test(hex) || hex.length > maxHexDigits) {
      throw new Error('Invalid VDF integer shape');
    }
  }
  let x = BigInt(`0x${challenge.args.x}`);
  const modulus = BigInt(`0x${challenge.args.mod}`);
  if (modulus <= 0n) throw new Error('Invalid VDF modulus');
  const now = options.now ?? Date.now;
  let previous = now();
  if (!Number.isSafeInteger(previous)) throw new Error('Invalid VDF clock');
  const started = previous;
  const elapsed = (): number => {
    const current = now();
    if (!Number.isSafeInteger(current) || current < previous) {
      throw new Error('VDF clock must be monotonic integer milliseconds');
    }
    previous = current;
    return current - started;
  };
  let count = 0;
  // Match the worker's short-circuit condition and its strict > maxTime stop.
  while (count < iterations || elapsed() < challenge.minTime) {
    if (count >= maxIterations) throw new Error('VDF iteration resource limit exceeded');
    x = (x * x) % modulus;
    count++;
    if (elapsed() > challenge.maxTime) break;
  }
  const spendTime = elapsed();
  return createVdfPowerParam(challenge, x.toString(16), count, spendTime);
}
