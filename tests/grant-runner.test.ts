import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getSuperCoupons, grantCouponWithRetry, type AuthType, type CouponInfoType, type GrantResult } from '../src/api.ts'
import { waitForFire, runAccountGrants, grantReportFailed } from '../src/grant/grant-runner.ts'

const auth: AuthType = { xsrfToken: 'fixture-xsrf', jSessionId: 'fixture-session', glUid: 'fixture-uid' }
const coupon = (id: string): CouponInfoType => ({ brandId: 'fixture-brand', couponId: id, couponType: 'PHONE_REWARD' })
const result = (c: CouponInfoType, ok: boolean, uncertain = false): GrantResult => ({ coupon: c, ok, attempts: 1, ...(uncertain ? { uncertain: true } : {}) })
const base = { auth, index: 1, pre: [coupon('a')], types: ['PHONE_REWARD'], fireAt: 1000, phase2DelayMs: 200, grantOptions: {} }

test('业务查券失败不能被解释为成功空列表', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{"code":836}'))
  await assert.rejects(getSuperCoupons(auth), /code 836/)
})
test('成功空列表与格式损坏响应明确区分', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{"code":200,"result":{"brands":[]}}'))
  assert.deepEqual(await getSuperCoupons(auth), [])
  t.mock.method(globalThis, 'fetch', async () => new Response('{"code":200,"result":{}}'))
  await assert.rejects(getSuperCoupons(auth), /brands 数组/)
})
test('查券取消信号覆盖响应体读取，不会挂住预热', async t => {
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init: RequestInit) => {
    const signal = init.signal!
    return { ok: true, json: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('fixture body timeout')), { once: true })) } as unknown as Response
  })
  const controller = new AbortController()
  const pending = getSuperCoupons(auth, { signal: controller.signal })
  await Promise.resolve()
  controller.abort()
  await assert.rejects(pending, /body timeout/)
})
test('保活后按新的剩余时间等待，不叠加网络耗时错过开火', async () => {
  let now = 0
  const slept: number[] = []
  await waitForFire(5000, 5000, () => {}, {
    now: () => now,
    ping: async () => { now += 3600; return 3600 },
    sleep: async ms => { slept.push(ms); now += ms },
    sleepUntil: async target => { now = Math.max(now, target) },
  })
  assert.equal(now, 5000)
  assert.deepEqual(slept, [])
})
test('第二次扫描按开火时刻安排，新券不等第一波的挂起请求', async () => {
  const events: string[] = []
  let finishA!: (value: GrantResult) => void
  const pendingA = new Promise<GrantResult>(resolve => { finishA = resolve })
  const running = runAccountGrants(base, {
    sleepUntil: async at => { assert.equal(at, 1200); events.push('second-deadline') },
    query: async () => { events.push('query'); return [coupon('a'), coupon('b')] },
    grant: async (_auth, c) => {
      events.push('grant-' + c.couponId)
      return c.couponId === 'a' ? pendingA : result(c, true)
    },
  })
  for (let i = 0; i < 5; i++) await Promise.resolve()
  assert.ok(events.includes('grant-b'))
  finishA(result(coupon('a'), true))
  const report = await running
  assert.equal(events.filter(e => e === 'grant-a').length, 1)
  assert.equal(report.index, 1)
  assert.equal(grantReportFailed(report), false)
})
test('第一波明确拒绝后允许补领，同品牌券仅提交一次每波', async () => {
  let a = 0
  const report = await runAccountGrants({ ...base, pre: [coupon('a'), coupon('a')] }, {
    sleepUntil: async () => {}, query: async () => [coupon('a'), coupon('a')],
    grant: async (_auth, c) => result(c, ++a > 1),
  })
  assert.equal(a, 2)
  assert.equal(grantReportFailed(report), false)
})
test('结果不确定的第一波在二次列表仍出现时不重复提交', async () => {
  let count = 0
  const report = await runAccountGrants(base, {
    sleepUntil: async () => {}, query: async () => [coupon('a')],
    grant: async (_auth, c) => { count++; return result(c, false, true) },
  })
  assert.equal(count, 1)
  assert.equal(grantReportFailed(report), true)
})
test('phase2-delay=0 真正关闭第二次查询和领取', async () => {
  const report = await runAccountGrants({ ...base, pre: [], phase2DelayMs: 0 }, {
    sleepUntil: async () => { throw new Error('must not wait') },
    query: async () => { throw new Error('must not query') },
    grant: async () => { throw new Error('must not grant') },
  })
  assert.deepEqual(report.phase2, [])
  assert.equal(grantReportFailed(report), false)
})
test('预取和二次查询全失败时保留错误并返回失败状态', async () => {
  const report = await runAccountGrants({ ...base, pre: [], preflightError: '预取失败' }, {
    sleepUntil: async () => {}, query: async () => { throw new Error('fixture query failed') },
    grant: async () => { throw new Error('must not grant') },
  })
  assert.equal(report.errors.length, 2)
  assert.equal(report.querySucceeded, false)
  assert.equal(grantReportFailed(report), true)
})
test('领取网络错误不自动重放，并明确标为结果不确定', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('fixture network failure') })
  const response = await grantCouponWithRetry(auth, coupon('a'), { retries: 2 })
  assert.equal(calls, 1)
  assert.equal(response.uncertain, true)
})
