import { randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createCaptchaEncoder, type CaptchaEncoder } from './urs-captcha-crypto.ts';

/** Pure NECaptcha 2.21.5 constructors. No browser, network or saved HAR values. */
export class UnsupportedCaptchaError extends Error {
  readonly captchaType: number;
  constructor(captchaType: number) {
    super(`验证码类型 ${captchaType} 需要当前客户端尚未实现的人工交互`);
    this.name = 'UnsupportedCaptchaError';
    this.captchaType = captchaType;
  }
}

export class CaptchaRuntimeRequiredError extends Error {
  constructor(field: 'fingerprint' | 'acToken') {
    super(`智能验证码需要本次会话生成的 ${field}；当前尚未实现官方运行时采集`);
    this.name = 'CaptchaRuntimeRequiredError';
  }
}

export interface CaptchaPoint {
  /** Coordinates relative to control element; elapsed milliseconds after hover. */
  x: number;
  y: number;
  elapsedMs: number;
}

export interface JigsawChallenge {
  type: 2;
  width: number;
  background: string[];
  front: string[];
}

export interface JigsawAnswer {
  /** Piece position and the solver's drag samples in displayed coordinates. */
  left: number;
  moves: CaptchaPoint[];
  mouseDownCount: number;
}

export type JigsawSolver = (challenge: JigsawChallenge) => Promise<JigsawAnswer>;

/** Official jigsaw onMouseUp: percentage position, sampled drag, press count. */
export function buildJigsawCaptchaData(token: string, width: number, answer: JigsawAnswer): string {
  if (!Number.isFinite(answer.left) || answer.left < 0 || answer.left > width || !answer.moves.length) {
    throw new Error('滑块求解未返回有效位置和轨迹');
  }
  const encoder = createCaptchaEncoder();
  const traces = answer.moves.map(point => encoder.xor(token, finitePoint(point)));
  return JSON.stringify({
    d: encoder.encode(sample(traces, 50).join(':')),
    m: '',
    p: encoder.encode(encoder.xor(token, `${Math.trunc(answer.left) / width * 100}`)),
    ext: encoder.encode(encoder.xor(token, `${answer.mouseDownCount},${traces.length}`)),
  });
}

export interface SmartCaptchaInput {
  token: string;
  /** Actual human click; omitted means a keyboard control activation with no coordinates. */
  click?: CaptchaPoint;
  /** Actual movement samples; never substitute synthetic human trajectories. */
  moves?: readonly CaptchaPoint[];
}

function finitePoint(point: CaptchaPoint): string {
  if (![point.x, point.y, point.elapsedMs].every(Number.isFinite) || point.elapsedMs < 0) {
    throw new Error('验证码坐标和时间必须是有限数值，时间不能为负数');
  }
  return `${Math.round(point.x)},${Math.round(point.y)},${point.elapsedMs}`;
}

/** Official util.sample selects <=50 points evenly, retaining both endpoints. */
function sample<T>(input: readonly T[], count: number): T[] {
  if (input.length <= count) return [...input];
  const result: T[] = [];
  const step = (input.length - 1) / (count - 1);
  let sampleIndex = 0;
  for (let index = 0; index < input.length; index++) {
    if (index >= sampleIndex * step) {
      result.push(input[index]!);
      sampleIndex++;
    }
  }
  return result;
}

function nonempty(value: string, name: string): void {
  if (!value) throw new Error(`缺少验证码字段 ${name}`);
}

/** Returned proof is request data, never a server success claim. */
export function buildSmartCaptchaData(
  input: SmartCaptchaInput,
  encoder: CaptchaEncoder = createCaptchaEncoder(),
): string {
  nonempty(input.token, 'token');
  const traces = (input.moves ?? []).map((point) => encoder.xor(input.token, finitePoint(point)));
  const position = input.click ? finitePoint(input.click) : '';
  return JSON.stringify({
    d: '',
    m: encoder.encode(sample(traces, 50).join(':')),
    p: encoder.encode(encoder.xor(input.token, position)),
    ext: encoder.encode(encoder.xor(input.token, `1,${traces.length}`)),
  });
}

/**
 * URS mode=bind calls SDK verifyIntellisenseCaptcha(), whose position is 0,0,elapsed.
 * elapsedMs is measured since control construction (or zero after clear), not a
 * synthetic human timing profile. The official bound component uses width=240.
 */
export function buildBoundSmartCaptchaData(
  token: string,
  elapsedMs: number,
  encoder: CaptchaEncoder = createCaptchaEncoder(),
): string {
  return buildSmartCaptchaData({ token, click: { x: 0, y: 0, elapsedMs }, moves: [] }, encoder);
}

/** Same payload as sdk eypt(util.uuid(32)); generated fresh for every request. */
export function createCaptchaCb(encoder: CaptchaEncoder = createCaptchaEncoder()): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const nonce = Array.from({ length: 32 }, () => alphabet[randomInt(alphabet.length)]).join('');
  return encoder.encode(nonce);
}

/** rawValidate MUST come from a successful fresh /check response. */
export function wrapCaptchaValidate(
  rawValidate: string,
  fingerprint: string,
  zoneId = '',
  encoder: CaptchaEncoder = createCaptchaEncoder(),
): string {
  nonempty(rawValidate, 'validate');
  if (!fingerprint) throw new CaptchaRuntimeRequiredError('fingerprint');
  const safe = encoder.encode(`${rawValidate}::${fingerprint}`).replace(/[\\/+]/g, (char) =>
    ({ '\\': '-', '/': '_', '+': '.' })[char]!,
  );
  return zoneId ? `${zoneId}_${safe}` : safe;
}

export interface FreshCaptchaRuntime {
  fingerprint: string;
  acToken: string;
  /** getconf's ac.enable, which controls whether a token is required. */
  anticheatEnabled: boolean;
  devicePixelRatio: number;
  deviceType: 1 | 2 | 3;
  /** SDK browser-feature result; must reflect actual collector, never forced zero. */
  browserFeature: number;
}

/** Validate required runtime inputs before constructing any protocol request. */
export function requireFreshCaptchaRuntime(runtime: FreshCaptchaRuntime): void {
  if (!runtime.fingerprint) throw new CaptchaRuntimeRequiredError('fingerprint');
  if (runtime.anticheatEnabled && !runtime.acToken) throw new CaptchaRuntimeRequiredError('acToken');
  if (!Number.isFinite(runtime.devicePixelRatio) || runtime.devicePixelRatio <= 0 ||
      !Number.isInteger(runtime.browserFeature) || runtime.browserFeature < 0) {
    throw new Error('验证码运行环境参数无效');
  }
}

/** The caller handles protocol transport/cookie jar and uses current getconf zoneId. */
export function buildSmartCheckParams(options: {
  captchaId: string;
  zoneId: string;
  referer: string;
  width: number;
  runtime: FreshCaptchaRuntime;
  proof: SmartCaptchaInput;
}): URLSearchParams {
  requireFreshCaptchaRuntime(options.runtime);
  nonempty(options.captchaId, 'id');
  if (!Number.isFinite(options.width) || options.width <= 0) throw new Error('验证码宽度无效');
  return new URLSearchParams({
    referer: options.referer,
    zoneId: options.zoneId,
    id: options.captchaId,
    version: '2.21.5',
    cb: createCaptchaCb(),
    extraData: '',
    bf: String(options.runtime.browserFeature),
    runEnv: '10',
    sdkVersion: 'undefined',
    token: options.proof.token,
    type: '5',
    width: String(options.width),
    data: buildSmartCaptchaData(options.proof),
    callback: createCaptchaJsonpCallback(),
  });
}

/** Reject graph/interactive fallback instead of reporting a fake captcha success. */
export function assertSmartCaptchaChallenge(value: { type: number }): void {
  if (value.type !== 5) throw new UnsupportedCaptchaError(value.type);
}

export function createCaptchaJsonpCallback(): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const suffix = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('');
  return `__JSONP_${suffix}_0`;
}

/** Exact mode=bind /get query. dt is only an optional stored getconf tracker. */
export function buildGetParams(options: {
  captchaId: string;
  zoneId: string;
  referer: string;
  runtime: FreshCaptchaRuntime;
}): URLSearchParams {
  requireFreshCaptchaRuntime(options.runtime);
  nonempty(options.captchaId, 'id');
  return new URLSearchParams({
    referer: options.referer,
    zoneId: options.zoneId,
    id: options.captchaId,
    fp: options.runtime.fingerprint,
    https: 'true',
    type: 'undefined',
    width: '',
    sizeType: 'undefined',
    version: '2.21.5',
    dpr: String(options.runtime.devicePixelRatio),
    dev: String(options.runtime.deviceType),
    cb: createCaptchaCb(),
    acToken: options.runtime.acToken,
    ipv6: 'false',
    runEnv: '10',
    group: '',
    scene: '',
    sdkVersion: 'undefined',
    smsVersion: 'v3',
    callback: createCaptchaJsonpCallback(),
  });
}

export function buildBoundSmartCheckParams(options: {
  captchaId: string;
  zoneId: string;
  referer: string;
  runtime: FreshCaptchaRuntime;
  token: string;
  elapsedMs: number;
}): URLSearchParams {
  return buildSmartCheckParams({
    captchaId: options.captchaId,
    zoneId: options.zoneId,
    referer: options.referer,
    runtime: options.runtime,
    width: 240,
    proof: { token: options.token, click: { x: 0, y: 0, elapsedMs: options.elapsedMs }, moves: [] },
  });
}

export interface CaptchaProtocolSession {
  request(url: string, options?: {
    method?: 'GET' | 'POST';
    body?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  }): Promise<{ status: number; text: string }>;
}

function parseCaptchaResponse(text: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch {
    const wrapper = /^\s*[A-Za-z_$][\w$]*\s*\(([\s\S]*)\)\s*;?\s*$/.exec(text);
    if (!wrapper) throw new Error('验证码服务响应不是 JSON 或 JSONP');
    try { parsed = JSON.parse(wrapper[1]!); } catch { throw new Error('验证码服务 JSONP 数据无效'); }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('验证码服务响应结构无效');
  }
  return parsed as Record<string, unknown>;
}

async function captchaGet(
  session: CaptchaProtocolSession,
  path: 'get' | 'check',
  params: URLSearchParams,
): Promise<Record<string, unknown>> {
  const response = await session.request(`https://webzjcaptcha.reg.163.com/api/v3/${path}?${params}`, {
    method: 'GET',
    timeoutMs: 20_000,
  });
  if (response.status !== 200) throw new Error(`验证码 ${path} 请求 HTTP ${response.status}`);
  const result = parseCaptchaResponse(response.text);
  if (result.error !== 0) {
    const code = typeof result.error === 'number' && Number.isFinite(result.error) ? result.error : 'unknown';
    throw new Error(`验证码 ${path} 服务拒绝，错误码 ${code}`);
  }
  if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
    throw new Error(`验证码 ${path} 服务响应缺少 data`);
  }
  return result.data as Record<string, unknown>;
}

/**
 * Live transport is invoked only when caller explicitly calls this function.
 * getconf and WM acToken must already be fresh. This returns a wrapped server
 * validate only after result=true; graph fallback/errors cannot yield success.
 * Native fallback fingerprints honestly disclose collector errors; service
 * acceptance is determined solely by fresh server responses.
 */
export type CaptchaCheckObservation = {
  stage: 'challenge' | 'check';
  accepted: boolean;
  challengeType?: number;
  /** 1-based check submission number. Retries re-issue a fresh challenge. */
  attempt?: number;
};

/**
 * A `result=false` response is a definite rejection, not an uncertain outcome, so no
 * request is replayed. Bound mode next fetches a classic challenge. Optional retries
 * fetch a new classic challenge; waiting does not establish rate limiting as a cause.
 */
export interface SmartCaptchaRetryPolicy {
  /** Maximum slider submissions after the single smart check. */
  maxCheckAttempts: number;
  /** Base backoff between submissions; grows linearly per retry. */
  retryDelayMs: number;
}

export const DEFAULT_SMART_CAPTCHA_RETRY: SmartCaptchaRetryPolicy = { maxCheckAttempts: 1, retryDelayMs: 1500 };

function resolveRetryPolicy(value: Partial<SmartCaptchaRetryPolicy> | undefined): SmartCaptchaRetryPolicy {
  const policy = { ...DEFAULT_SMART_CAPTCHA_RETRY, ...value };
  if (!Number.isSafeInteger(policy.maxCheckAttempts) || policy.maxCheckAttempts < 1 || policy.maxCheckAttempts > 10) {
    throw new Error('验证码重试次数无效');
  }
  if (!Number.isSafeInteger(policy.retryDelayMs) || policy.retryDelayMs < 0 || policy.retryDelayMs > 60_000) {
    throw new Error('验证码重试间隔无效');
  }
  return policy;
}

export interface PreparedSmartCaptcha {
  /** Submit this fresh challenge once; preparation itself cannot issue a validate. */
  verify(): Promise<string>;
}

export async function prepareSmartCaptcha(
  session: CaptchaProtocolSession,
  captchaId: string,
  options: {
    zoneId: string; referer: string; runtime: FreshCaptchaRuntime; preparedAt?: number;
    report?: (event: CaptchaCheckObservation) => void;
    retry?: Partial<SmartCaptchaRetryPolicy>;
    solveJigsaw?: JigsawSolver;
    refreshAnticheat?: () => Promise<string>;
  },
): Promise<PreparedSmartCaptcha> {
  requireFreshCaptchaRuntime(options.runtime);
  const startedAt = options.preparedAt ?? Date.now();
  if (!Number.isSafeInteger(startedAt) || startedAt <= 0 || startedAt > Date.now()) {
    throw new Error('验证码会话准备时间无效');
  }
  const policy = resolveRetryPolicy(options.retry);
  const issue = async () => {
    const challenge = await captchaGet(session, 'get', buildGetParams({ captchaId, ...options }));
    if (typeof challenge.type !== 'number') throw new Error('验证码挑战缺少 type');
    options.report?.({ stage: 'challenge', accepted: challenge.type === 5, challengeType: challenge.type });
    assertSmartCaptchaChallenge({ type: challenge.type });
    if (typeof challenge.token !== 'string' || !challenge.token) throw new Error('验证码挑战缺少 token');
    const waitTime = challenge.waitTime === undefined ? 0 : challenge.waitTime;
    if (typeof waitTime !== 'number' || !Number.isFinite(waitTime) || waitTime < 0 || waitTime > 60_000) {
      throw new Error('验证码服务返回的 waitTime 无效');
    }
    return { token: challenge.token, waitTime, issuedAt: Date.now() };
  };
  const challenge = await issue();
  let attempted = false;
  return {
    async verify() {
      if (attempted) throw new Error('此验证码挑战已提交，请准备新的挑战');
      attempted = true; // Lock before the first await, including the waitTime delay.
      const now = Date.now();
      if (now < challenge.issuedAt || now < startedAt) throw new Error('验证码会话时钟发生回拨');
      const remaining = Math.max(0, challenge.waitTime - (now - challenge.issuedAt));
      if (remaining > 0) await delay(remaining);
      const checkAt = Date.now();
      if (checkAt < challenge.issuedAt || checkAt < startedAt) throw new Error('验证码会话时钟发生回拨');
      const checked = await captchaGet(session, 'check', buildBoundSmartCheckParams({
        captchaId, ...options, token: challenge.token, elapsedMs: checkAt - startedAt,
      }));
      if (checked.result === true) {
        if (typeof checked.validate !== 'string' || !checked.validate) throw new Error('验证码校验缺少 validate');
        if (typeof checked.token === 'string' && checked.token !== challenge.token) {
          throw new Error('验证码响应 token 与本次挑战不一致');
        }
        const validate = wrapCaptchaValidate(checked.validate, options.runtime.fingerprint, options.zoneId);
        options.report?.({ stage: 'check', accepted: true, attempt: 1 });
        return validate;
      }
      // result=false rejects this challenge without revealing a specific cause.
      options.report?.({ stage: 'check', accepted: false, attempt: 1 });
      // Official bound mode opens the classic control with this session's token.
      // Repeating type=5 cannot substitute for that interactive branch.
      let previousToken = challenge.token;
      for (let attempt = 1; ; attempt++) {
        if (options.refreshAnticheat) options.runtime.acToken = await options.refreshAnticheat();
        const fallbackParams = buildGetParams({ captchaId, ...options });
        fallbackParams.set('token', previousToken);
        fallbackParams.set('width', '320');
        fallbackParams.set('sizeType', '10');
        fallbackParams.set('audio', 'false');
        fallbackParams.set('lang', 'zh-CN');
        const fallback = await captchaGet(session, 'get', fallbackParams);
        const fallbackIssuedAt = Date.now();
        if (fallback.type !== 2) throw new UnsupportedCaptchaError(Number(fallback.type));
        options.report?.({ stage: 'challenge', accepted: true, challengeType: 2 });
        if (!options.solveJigsaw) {
          throw new Error('智能验证未通过，服务端已下发滑块验证码（type=2）；当前调用方未提供滑块求解器，本次未发送短信');
        }
        if (typeof fallback.token !== 'string' || !fallback.token) throw new Error('滑块挑战缺少 token');
        previousToken = fallback.token;
        const urls = (value: unknown): string[] => {
          const list = Array.isArray(value) ? value : [value];
          return list.filter((item): item is string => typeof item === 'string' && item.length > 0);
        };
        const answer = await options.solveJigsaw({ type: 2, width: 320,
          background: urls(fallback.bg), front: urls(fallback.front) });
        const wait = Number(fallback.waitTime ?? 0) - (Date.now() - fallbackIssuedAt);
        if (wait > 0) await delay(wait);
        const manualParams = buildSmartCheckParams({ captchaId, ...options, width: 320,
          proof: { token: fallback.token } });
        manualParams.set('type', '2');
        manualParams.set('acToken', 'undefined');
        manualParams.set('data', buildJigsawCaptchaData(fallback.token, 320, answer));
        const manual = await captchaGet(session, 'check', manualParams);
        options.report?.({ stage: 'check', accepted: manual.result === true, challengeType: 2 });
        if (manual.result === true && typeof manual.validate === 'string' && manual.validate) {
          return wrapCaptchaValidate(manual.validate, options.runtime.fingerprint, options.zoneId);
        }
        if (attempt >= policy.maxCheckAttempts) throw new Error('滑块结果未通过服务端校验，本次未发送短信');
        await delay(policy.retryDelayMs * attempt);
      }
    },
  };
}

/** Convenience path for callers with no separate input/preparation stage. */
export async function solveSmartCaptcha(
  session: CaptchaProtocolSession,
  captchaId: string,
  options: Parameters<typeof prepareSmartCaptcha>[2],
): Promise<string> {
  const challenge = await prepareSmartCaptcha(session, captchaId, options);
  return challenge.verify();
}

