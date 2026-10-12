import { epochNow, sleep, sleepUntil, ping, getSuperCoupons, grantCouponWithRetry, type AuthType, type CouponInfoType, type GrantOptions, type GrantResult } from '../api.ts'

export function deadlineSignal(deadline: number, maximumMs: number): AbortSignal {
  const budget = Math.floor(Math.min(maximumMs, deadline - epochNow()))
  return budget <= 0 ? AbortSignal.abort() : AbortSignal.timeout(budget)
}

export async function waitForFire(fireAt: number, intervalMs: number, report: (message: string) => void, deps = {
  now: epochNow, sleep, sleepUntil, ping,
}): Promise<void> {
  while (deps.now() < fireAt) {
    const remaining = fireAt - deps.now()
    if (remaining <= 1500) { await deps.sleepUntil(fireAt); return }
    try {
      const budget = Math.max(1, Math.floor(Math.min(2000, remaining - 1500)))
      const rtt = await deps.ping({ signal: AbortSignal.timeout(budget) })
      report(`连接保活: RTT ${rtt.toFixed(0)}ms`)
    } catch { report('连接保活失败或超过预算；继续等待开火') }
    const afterRequest = fireAt - deps.now()
    if (afterRequest > 1500) await deps.sleep(Math.min(intervalMs, afterRequest - 1500))
  }
}

export interface AccountGrantReport {
  index: number
  phase1: GrantResult[]
  phase2: GrantResult[]
  errors: string[]
  querySucceeded: boolean
}
const key = (coupon: CouponInfoType) => `${coupon.brandId}:${coupon.couponId}`

/** Second scan runs independently from pending grants; per-coupon state prevents duplicate submissions. */
export async function runAccountGrants(options: {
  auth: AuthType; index: number; pre: CouponInfoType[]; preflightError?: string;
  types: string[]; fireAt: number; phase2DelayMs: number; grantOptions: GrantOptions;
}, deps = {
  sleepUntil, query: getSuperCoupons, grant: grantCouponWithRetry,
}): Promise<AccountGrantReport> {
  const report: AccountGrantReport = {
    index: options.index, phase1: [], phase2: [],
    errors: options.preflightError ? [options.preflightError] : [], querySucceeded: !options.preflightError,
  }
  type Entry = { result?: GrantResult; pending: Promise<void> }
  const states = new Map<string, Entry>()
  const submit = (coupon: CouponInfoType, phase: GrantResult[]): Promise<void> => {
    const entry: Entry = { pending: Promise.resolve() }
    states.set(key(coupon), entry)
    entry.pending = deps.grant(options.auth, coupon, options.grantOptions).then((result) => {
      entry.result = result
      phase.push(result)
    }).catch(() => {
      const result: GrantResult = { ok: false, coupon, attempts: 1, uncertain: true, message: '领取过程异常；结果不确定' }
      entry.result = result
      phase.push(result)
    })
    return entry.pending
  }
  const first = Promise.all(options.pre.filter((c, i, all) => all.findIndex(v => key(v) === key(c)) === i)
    .map(c => submit(c, report.phase1)))
  const second = (async () => {
    if (options.phase2DelayMs === 0) return
    await deps.sleepUntil(options.fireAt + options.phase2DelayMs)
    let fresh: CouponInfoType[]
    try {
      fresh = (await deps.query(options.auth)).filter(c => options.types.includes(c.couponType ?? ''))
      report.querySucceeded = true
    } catch { report.errors.push('二次查券失败（业务、网络或超时）'); return }
    const scheduled = new Set<string>()
    await Promise.all(fresh.map(async coupon => {
      const id = key(coupon)
      if (scheduled.has(id)) return
      scheduled.add(id)
      const previous = states.get(id)
      if (previous) {
        await previous.pending // Only this coupon waits; new coupons launch immediately.
        if (!previous.result || previous.result.ok || previous.result.uncertain) return
      }
      await submit(coupon, report.phase2)
    }))
  })()
  await Promise.all([first, second])
  return report
}

export function grantReportFailed(report: AccountGrantReport): boolean {
  if (!report.querySucceeded) return true
  const latest = new Map<string, GrantResult>()
  for (const result of [...report.phase1, ...report.phase2]) latest.set(key(result.coupon), result)
  return [...latest.values()].some(result => !result.ok) || report.errors.some(e => e.startsWith('二次'))
}
