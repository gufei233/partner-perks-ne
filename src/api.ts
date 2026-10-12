import crypto from 'crypto'
import { parseSetCookie } from 'cookie'

export const ORIGIN = 'https://inf.ds.163.com'
export const GRANT_URL = `${ORIGIN}/v1/web/exp-vip/external/super-coupon/grant`
export const SUPER_COUPON_URL = `${ORIGIN}/v1/web/exp-vip/external/super-coupon/info`
export const LOGIN_URL = `${ORIGIN}/v1/web/base/login`

export type AuthType = {
  xsrfToken: string
  jSessionId: string
  glUid: string
}

export type CouponInfoType = {
  brandId: string
  brandName?: string
  couponId: string
  couponName?: string
  couponType?: string
}

export type GrantResult = {
  ok: boolean
  coupon: CouponInfoType
  attempts: number
  code?: number
  message?: string
  /** A timeout/network/5xx/invalid response may have been committed upstream. */
  uncertain?: boolean
}

export type RequestOptions = { signal?: AbortSignal }

export type GrantOptions = {
  retries?: number
  retryDelayMs?: number
  timeoutMs?: number
}

/** 登录必须返回有效会话；XSRF 使用本次请求发送的值或服务端覆盖值。 */
export const REQUIRED_LOGIN_COOKIES = ['JSESSIONID'] as const

/** 登录成功后通常返回、但仅作为 Gl-Uid 请求头使用的字段；缺失只警告不阻断 */
export const OPTIONAL_LOGIN_COOKIES = ['GOD_UUID'] as const

/** 可领取的券类型 */
export const COUPON_TYPES = ['PHONE_REWARD', 'CODE', 'DIRECT_LINK'] as const

// ---------------------------------------------------------------- 基础工具

export function getSHA1(data: string) {
  return crypto.createHash('sha1').update(data, 'utf8').digest('hex')
}

/** 高精度 Unix epoch 毫秒（performance 计时，不受系统时钟回拨影响） */
export function epochNow(): number {
  return performance.timeOrigin + performance.now()
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 精确等待到目标 epoch 时刻（±1ms 内）。
 * 先 setTimeout 粗睡，最后 30ms 内用 1ms 级小睡收敛，不做长忙等。
 */
export async function sleepUntil(targetEpochMs: number): Promise<void> {
  for (;;) {
    const remain = targetEpochMs - epochNow()
    if (remain <= 1) return
    if (remain > 30) await sleep(remain - 15)
    else if (remain > 2) await sleep(1)
    else return
  }
}

export function formatTime(date: Date) {
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0')
  return `${date.toLocaleString('zh-CN', { hour12: false })}.${milliseconds}`
}

// ---------------------------------------------------------------- 请求封装

export function customFetch(
  auth: AuthType | undefined,
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
): Promise<Response> {
  if (!auth) {
    throw new Error('customFetch: 缺少登录凭证（auth），请先通过 getAuth 登录')
  }
  const { xsrfToken, jSessionId, glUid } = auth
  const customHeaders: Record<string, string> = {
    Cookie: `GL-XSRF-TOKEN=${xsrfToken}; JSESSIONID=${jSessionId}`,
    'Content-Type': 'application/json',
    'Gl-X-Xsrf-Token': xsrfToken,
    'Gl-Uid': glUid,
  }
  if (init?.method && init.method.toUpperCase() === 'POST') {
    customHeaders['Gl-Checksum'] = getSHA1(''.concat(String(init?.body ?? '')).concat(xsrfToken))
  }
  return fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(15_000),
    headers: {
      ...customHeaders,
      ...init?.headers,
    },
  })
}

// ---------------------------------------------------------------- 查券 / 领券

export function querySuperCoupons(auth: AuthType | undefined, options: RequestOptions = {}) {
  return customFetch(auth, SUPER_COUPON_URL, {
    method: 'POST',
    body: JSON.stringify({}),
    signal: options.signal ?? AbortSignal.timeout(5000),
  })
}

export function formatSuperCouponsResp(resp: any): CouponInfoType[] {
  const brands = resp?.result?.brands
  if (!Array.isArray(brands)) throw new Error('查询超级券列表失败: 缺少 brands 数组')
  const coupons: CouponInfoType[] = []
  for (const brand of brands) {
    if (!brand || typeof brand.brandId !== 'string' || !Array.isArray(brand.superCoupons)) {
      throw new Error('查询超级券列表失败: 品牌结构异常')
    }
    for (const coupon of brand.superCoupons) {
      if (!coupon || typeof coupon.couponId !== 'string' || !coupon.couponId || !brand.brandId) {
        throw new Error('查询超级券列表失败: 券标识异常')
      }
      coupons.push({
        brandId: brand.brandId, couponId: coupon.couponId,
        ...(typeof brand.brandName === 'string' ? { brandName: brand.brandName } : {}),
        ...(typeof coupon.couponName === 'string' ? { couponName: coupon.couponName } : {}),
        ...(typeof coupon.couponType === 'string' ? { couponType: coupon.couponType } : {}),
      })
    }
  }
  return coupons
}

/** 查询失败与成功但没有券必须区分。超时信号覆盖响应体读取。 */
export async function getSuperCoupons(auth: AuthType | undefined, options: RequestOptions = {}): Promise<CouponInfoType[]> {
  const res = await querySuperCoupons(auth, options)
  if (!res.ok) throw new Error(`查询超级券列表失败: HTTP ${res.status}`)
  const body = await res.json()
  if (body?.code !== 200) {
    const code = typeof body?.code === 'number' ? body.code : 'unknown'
    throw new Error(`查询超级券列表失败: 业务 code ${code}`)
  }
  return formatSuperCouponsResp(body)
}

export function grantCoupon(auth: AuthType | undefined, couponInfo: CouponInfoType | undefined, options: RequestOptions = {}) {
  if (!couponInfo) {
    throw new Error('grantCoupon: 缺少券信息（couponInfo）')
  }
  const { brandId, couponId: superCouponId } = couponInfo
  const payload = { brandId, superCouponId, phoneBizType: 'VIP' }
  return customFetch(auth, GRANT_URL, {
    method: 'POST',
    body: JSON.stringify(payload),
    signal: options.signal ?? AbortSignal.timeout(5000),
  })
}

function isRetryableStatus(status: number) {
  return status === 429 || status >= 500
}

/** 领一张券；对网络错误 / 429 / 5xx 做快速重试 */
export async function grantCouponWithRetry(
  auth: AuthType | undefined,
  coupon: CouponInfoType,
  opts: GrantOptions = {},
): Promise<GrantResult> {
  const retries = opts.retries ?? 0
  const retryDelayMs = opts.retryDelayMs ?? 150
  let uncertain = false
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await grantCoupon(auth, coupon, { signal: AbortSignal.timeout(opts.timeoutMs ?? 5000) })
      if (res.status >= 500) uncertain = true
      if (isRetryableStatus(res.status) && attempt <= retries) {
        await res.arrayBuffer()
        await sleep(retryDelayMs)
        continue
      }
      const body: { code?: number; message?: string; msg?: string } = await res.json()
      const message = body.message ?? body.msg
      const ok = res.ok && body.code === 200
      if (typeof body.code !== 'number') uncertain = true
      return {
        ok, coupon, attempts: attempt, code: body.code ?? res.status,
        ...(!ok && uncertain ? { uncertain: true } : {}),
        ...(typeof message === 'string' ? { message } : {}),
      }
    } catch {
      // Timeout/network/invalid JSON cannot prove that the upstream did not grant.
      return { ok: false, coupon, attempts: attempt, uncertain: true, message: '领取响应不确定（网络、超时或响应格式错误）；不自动重复提交' }
    }
  }
}

/** 并发领取一组已知券 */
export function grantCoupons(
  auth: AuthType | undefined,
  coupons: CouponInfoType[],
  opts: GrantOptions = {},
): Promise<GrantResult[]> {
  return Promise.all(coupons.map((coupon) => grantCouponWithRetry(auth, coupon, opts)))
}

/** 查询 + 按类型过滤 + 并发领取 */
export async function grantAllCoupons(
  auth: AuthType | undefined,
  couponTypeList: string[] = ['PHONE_REWARD', 'CODE'],
  opts: GrantOptions = {},
): Promise<GrantResult[]> {
  const coupons = await getSuperCoupons(auth)
  const availGrantCoupons = coupons?.filter((c) => couponTypeList.includes(c?.couponType ?? '')) ?? []
  return grantCoupons(auth, availGrantCoupons, opts)
}

// ---------------------------------------------------------------- 登录 / 凭证

export async function login(ntesYdPassport: string, options: RequestOptions = {}) {
  if (!ntesYdPassport || /[\r\n;]/.test(ntesYdPassport)) throw new Error('缺少有效的 NTES_YD_PASSPORT')
  const xsrfToken = crypto.randomUUID()
  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: {
      Cookie: `NTES_YD_PASSPORT=${ntesYdPassport}; GL-XSRF-TOKEN=${xsrfToken}`,
      'Content-Type': 'application/json;charset=UTF-8',
      'Gl-X-Xsrf-Token': xsrfToken,
      'Gl-ClientType': '60',
      'Gl-DeviceId': crypto.randomUUID().replaceAll('-', ''),
      Origin: 'https://vip.ds.163.com',
      Referer: 'https://vip.ds.163.com/partner-perks',
    },
    signal: options.signal ?? AbortSignal.timeout(15000),
  })
  const data: any = await res.json().catch(() => null)
  return {
    status: res.status,
    ok: res.ok,
    headers: res.headers,
    data,
    xsrfToken,
  }
}

/**
 * 用 NTES_YD_PASSPORT 换取请求凭证，必须由业务 code=200 确认。
 * XSRF 使用本次请求的值或响应覆盖值；GOD_UUID 缺失时保留明确警告。
 */
export async function getAuth(ntesYdPassport: string, options: RequestOptions = {}): Promise<AuthType & { warning?: string }> {
  const r = await login(ntesYdPassport, options)
  const jar: Record<string, string> = {}
  for (const raw of r.headers.getSetCookie()) {
    const c = parseSetCookie(raw)
    if (c && c.name && c.value !== undefined) jar[c.name] = c.value
  }
  const missing = REQUIRED_LOGIN_COOKIES.filter((name) => !jar[name])
  if (!r.ok || r.data?.code !== 200 || missing.length) {
    const detail = typeof r.data?.code === 'number' ? `接口 code: ${r.data.code}` : `HTTP ${r.status}`
    const fields = missing.length ? `；缺少 Cookie [${missing.join(', ')}]` : ''
    throw new Error(`登录失败（${detail}）${fields}；请运行 npm run login 更新账号凭证`)
  }
  const glUid = jar['GOD_UUID'] ?? ''
  return {
    xsrfToken: jar['GL-XSRF-TOKEN'] || r.xsrfToken,
    jSessionId: jar['JSESSIONID'] ?? '',
    glUid,
    ...(glUid ? {} : { warning: '登录响应未返回 GOD_UUID（Gl-Uid 头将为空）；若领取接口报错请检查该字段' }),
  }
}

// ---------------------------------------------------------------- 抢券辅助：保活 / 时钟校准

/**
 * 向目标域名发一个轻量 GET，把 keep-alive 连接焐热（TLS 握手 + 连接池常驻）。
 * 返回往返耗时 ms，可作为赛前的 RTT 基准。
 */
export async function ping(options: RequestOptions = {}): Promise<number> {
  const t0 = epochNow()
  const res = await fetch(LOGIN_URL, { method: 'GET', signal: options.signal ?? AbortSignal.timeout(2000) })
  await res.arrayBuffer()
  return epochNow() - t0
}

export async function sampleServerDate(url: string = LOGIN_URL, options: RequestOptions = {}) {
  const t0 = epochNow()
  const res = await fetch(url, { method: 'GET', signal: options.signal ?? AbortSignal.timeout(2000) })
  await res.arrayBuffer()
  const t1 = epochNow()
  const dateHeader = res.headers.get('date')
  if (!dateHeader) throw new Error(`服务器响应缺少 Date 头 (HTTP ${res.status})`)
  return { dateMs: Date.parse(dateHeader), t0, t1 }
}

/**
 * 估算本地时钟与服务器时钟的偏差（本地 + offset ≈ 服务器）。
 *
 * Date 头只有 1 秒精度，直接相减误差可达 ±500ms。
 * 这里通过观察"服务器秒翻转"来精确对齐：连续采样中 Date 值从 S 跳到 S+1000
 * 说明翻转发生在两次请求生成响应之间。用 (t0+t1)/2（请求往返中点）估计
 * 响应生成的本地时刻，把单程网络延迟 d≈RTT/2 从两端对称抵消，
 * 精度 ±（采样间隔/2），不受 RTT 大小影响。
 */
export async function getServerClockOffsetMs(
  opts: { flips?: number; intervalMs?: number; maxMs?: number } = {},
): Promise<number> {
  const wantFlips = opts.flips ?? 6
  const intervalMs = opts.intervalMs ?? 100
  const maxMs = opts.maxMs ?? 8000
  const estimates: number[] = []
  let prev: { dateMs: number; tMid: number } | undefined
  const start = epochNow()
  while (estimates.length < wantFlips && epochNow() - start < maxMs) {
    let sample: Awaited<ReturnType<typeof sampleServerDate>>
    try {
      sample = await sampleServerDate(LOGIN_URL, { signal: AbortSignal.timeout(Math.max(1, Math.floor(Math.min(2000, maxMs - (epochNow() - start))))) })
    } catch {
      if (prev) break
      throw new Error('时钟校准请求失败或超时')
    }
    const { dateMs, t0, t1 } = sample
    const tMid = (t0 + t1) / 2 // 响应生成的本地时刻（服务器写 Date 头 ≈ 请求到达时刻）
    if (prev && dateMs === prev.dateMs + 1000) {
      // 翻转时刻（服务器 epoch）= dateMs，落在本地 (prev.tMid, tMid] 区间内
      estimates.push(dateMs - (prev.tMid + tMid) / 2)
    }
    prev = { dateMs, tMid }
    if (estimates.length < wantFlips && epochNow() - start < maxMs) await sleep(intervalMs)
  }
  if (!estimates.length) {
    // 没等到翻转（网络太慢或采样太久）：退化为单次采样中点，±500ms
    if (!prev) throw new Error('时钟校准没有取得有效 Date 样本')
    return prev.dateMs + 500 - prev.tMid
  }
  estimates.sort((a, b) => a - b)
  const mid = estimates[Math.floor(estimates.length / 2)]
  return mid ?? (estimates[estimates.length - 1] ?? 0)
}
