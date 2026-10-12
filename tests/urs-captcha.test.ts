import assert from 'node:assert/strict'
import { test } from 'node:test'
import { solveSmartCaptcha, prepareSmartCaptcha, UnsupportedCaptchaError, buildBoundSmartCaptchaData } from '../src/login/urs/urs-captcha-proof.ts'
import { createNativeCaptchaFingerprint } from '../src/login/urs/urs-captcha-fingerprint.ts'
import { decodeSyntheticProofPosition } from './captcha-fixture-decoder.ts'
import { UrsAnticheatSession, parseWatchmanResponse } from '../src/login/urs/urs-anticheat.ts'

const runtime = {
  fingerprint: 'fixture-fingerprint', acToken: 'fixture-ac-token', anticheatEnabled: true,
  devicePixelRatio: 1, deviceType: 1 as const, browserFeature: 0,
}
const options = { zoneId: 'CN31', referer: 'https://dl.reg.163.com/webzj/v1.0.1/pub/index2_new.html', runtime }

test('智能验证持续 result=false 时不生成 validate，并按上限重新取挑战', async () => {
  const paths: string[] = []
  const session = { request: async (input: string) => {
    const url = new URL(input)
    paths.push(url.pathname)
    return { status: 200, text: JSON.stringify({ error: 0, data: url.pathname.endsWith('/get')
      ? { token: 'fresh-fixture', type: 5, waitTime: 0 }
      : { result: false, validate: '', token: 'fresh-fixture' } }) }
  } }
  const events: Array<{ stage: string; accepted: boolean; attempt?: number }> = []
  await assert.rejects(solveSmartCaptcha(session, 'fixture-captcha-id', {
    ...options, retry: { maxCheckAttempts: 3, retryDelayMs: 0 }, report: (event) => events.push(event),
  }), /result=false/)
  assert.deepEqual(paths, ['/api/v3/get', '/api/v3/check', '/api/v3/get', '/api/v3/check', '/api/v3/get', '/api/v3/check'])
  assert.equal(events.filter((event) => event.stage === 'check' && event.accepted).length, 0)
  assert.deepEqual(events.filter((event) => event.stage === 'check').map((event) => event.attempt), [1, 2, 3])
})

test('智能验证短时限流后重新取挑战并成功，不重放旧请求', async () => {
  const paths: string[] = []
  let checks = 0
  const session = { request: async (input: string) => {
    const url = new URL(input)
    paths.push(url.pathname)
    if (url.pathname.endsWith('/get')) {
      return { status: 200, text: JSON.stringify({ error: 0, data: { type: 5, token: `token-${checks}`, waitTime: 0 } }) }
    }
    checks++
    return { status: 200, text: JSON.stringify({ error: 0, data: checks === 1
      ? { result: false, validate: '', token: 'token-0' }
      : { result: true, validate: 'fixture-validate', token: `token-${checks - 1}` } }) }
  } }
  const events: Array<{ stage: string; accepted: boolean; attempt?: number }> = []
  const validate = await solveSmartCaptcha(session, 'fixture-captcha-id', {
    ...options, retry: { maxCheckAttempts: 3, retryDelayMs: 0 }, report: (event) => events.push(event),
  })
  assert.ok(validate.startsWith('CN31_'))
  assert.deepEqual(paths, ['/api/v3/get', '/api/v3/check', '/api/v3/get', '/api/v3/check'])
  assert.deepEqual(events.filter((event) => event.stage === 'check'), [
    { stage: 'check', accepted: false, attempt: 1 },
    { stage: 'check', accepted: true, attempt: 2 },
  ])
})

test('校验返回图形分支时立即停止，不重试也不伪造过码', async () => {
  const paths: string[] = []
  const session = { request: async (input: string) => {
    const url = new URL(input)
    paths.push(url.pathname)
    return { status: 200, text: JSON.stringify({ error: 0, data: url.pathname.endsWith('/get')
      ? { type: 5, token: 'fixture-token', waitTime: 0 }
      : { result: false, type: 2 } }) }
  } }
  await assert.rejects(solveSmartCaptcha(session, 'fixture-captcha-id', {
    ...options, retry: { maxCheckAttempts: 3, retryDelayMs: 0 },
  }), UnsupportedCaptchaError)
  assert.deepEqual(paths, ['/api/v3/get', '/api/v3/check'])
})

test('重试次数与间隔在发请求前校验', async () => {
  const session = { request: async () => { throw new Error('must not call') } }
  await assert.rejects(prepareSmartCaptcha(session, 'fixture-captcha-id', { ...options, retry: { maxCheckAttempts: 0 } }), /重试次数无效/)
  await assert.rejects(prepareSmartCaptcha(session, 'fixture-captcha-id', { ...options, retry: { retryDelayMs: -1 } }), /重试间隔无效/)
})

test('图形挑战只读取一次，停止协议校验而不伪造过码', async () => {
  let calls = 0
  const session = { request: async () => {
    calls++
    return { status: 200, text: JSON.stringify({ error: 0, data: { token: 'fresh-fixture', type: 2 } }) }
  } }
  await assert.rejects(solveSmartCaptcha(session, 'fixture-captcha-id', options), UnsupportedCaptchaError)
  assert.equal(calls, 1)
})

test('智能验证码真实等待服务端 waitTime；结果 token 必须对应本次会话', async () => {
  let calls = 0
  let getAt = 0
  const session = { request: async () => {
    calls++
    if (calls === 1) {
      getAt = performance.now()
      return { status: 200, text: JSON.stringify({ error: 0, data: { token: 'fresh-fixture', type: 5, waitTime: 25 } }) }
    }
    assert.ok(performance.now() - getAt >= 23)
    return { status: 200, text: JSON.stringify({ error: 0, data: { token: 'different-session', result: true, validate: 'fixture-validate' } }) }
  } }
  const events: Array<{ stage: string; accepted: boolean }> = []
  await assert.rejects(solveSmartCaptcha(session, 'fixture-captcha-id', { ...options, report: (event) => events.push(event) }), /token 与本次挑战不一致/)
  assert.ok(!events.some((event) => event.stage === 'check' && event.accepted))
})

test('绑定校验计时包含本次设备准备耗时，而不是生成请求时重新计零', async () => {
  const preparedAt = Date.now() - 200
  const session = { request: async (input: string) => {
    const url = new URL(input)
    if (url.pathname.endsWith('/get')) {
      return { status: 200, text: JSON.stringify({ error: 0, data: { type: 5, token: 'fixture-token', waitTime: 0 } }) }
    }
    const proof = JSON.parse(url.searchParams.get('data') ?? '{}')
    const position = decodeSyntheticProofPosition(proof.p, 'fixture-token').split(',')
    assert.deepEqual(position.slice(0, 2), ['0', '0'])
    assert.ok(Number(position[2]) >= 200)
    assert.ok(Number(position[2]) <= Date.now() - preparedAt)
    return { status: 200, text: JSON.stringify({ error: 0, data: { result: false } }) }
  } }
  await assert.rejects(solveSmartCaptcha(session, 'fixture-captcha-id', {
    ...options, preparedAt, retry: { maxCheckAttempts: 2, retryDelayMs: 0 },
  }), /result=false/)
})

test('未来计时起点在发请求前拒绝，不能伪造负耗时', async () => {
  let calls = 0
  const session = { request: async () => { calls++; throw new Error('must not call') } }
  await assert.rejects(solveSmartCaptcha(session, 'fixture-captcha-id', { ...options, preparedAt: Date.now() + 5000 }), /准备时间无效/)
  assert.equal(calls, 0)
})

test('服务端错误内容不写入本地日志错误', async () => {
  const session = { request: async () => ({ status: 200, text: JSON.stringify({ error: 'secret-do-not-print' }) }) }
  await assert.rejects(solveSmartCaptcha(session, 'fixture-captcha-id', options), (err: unknown) => err instanceof Error && !err.message.includes('secret-do-not-print'))
})

test('缺失 acToken 在发送请求前拒绝', async () => {
  let calls = 0
  const session = { request: async () => { calls++; throw new Error('must not call') } }
  await assert.rejects(solveSmartCaptcha(session, 'fixture-captcha-id', { ...options, runtime: { ...runtime, acToken: '' } }), /acToken/)
  assert.equal(calls, 0)
})

test('验证码绑定组件生成 d/m/p/ext，各次校验使用新随机盐', () => {
  const first = JSON.parse(buildBoundSmartCaptchaData('fixture-token', 300))
  const second = JSON.parse(buildBoundSmartCaptchaData('fixture-token', 300))
  assert.deepEqual(Object.keys(first).sort(), ['d', 'ext', 'm', 'p'])
  assert.equal(first.d, '')
  assert.notEqual(first.p, second.p)
})

test('Native 指纹明确报告缺少浏览器采集器且使用新会话随机数', () => {
  const first = createNativeCaptchaFingerprint('dl.reg.163.com')
  const second = createNativeCaptchaFingerprint('dl.reg.163.com')
  assert.equal(first.collectorAvailable, false)
  assert.ok(first.expiresAt > Date.now())
  assert.notEqual(first.fingerprint, second.fingerprint)
})

test('反作弊 token 只在设备与行为响应均成功后生成', () => {
  const session = new UrsAnticheatSession({ productNumber: 'fixture-product' })
  assert.throws(() => session.getToken(), /not verified/)
  const device = session.buildDeviceForm()
  assert.equal(device.path, '/v3/d')
  const deviceResponse = parseWatchmanResponse(`${device.callback}([200,0,"fresh-transport","fresh-device"]);`, device.callback)
  assert.equal(session.acceptDeviceResponse(deviceResponse), 200)
  assert.throws(() => session.getToken(), /not verified/)
  const behavior = session.buildBehaviorForm('fixture-business')
  assert.equal(behavior.path, '/v3/b')
  assert.equal(session.acceptBehaviorResponse([200, 0, 'fresh-next-transport']), 200)
  assert.match(session.getToken(), /^[a-f0-9]+$/)
})

test('预先取得挑战后才提交校验，证明中的耗时包含中间真实输入阶段', async (t) => {
  let now = Date.now()
  const origin = now
  t.mock.method(Date, 'now', () => now)
  const paths: string[] = []
  const session = { request: async (input: string) => {
    const url = new URL(input)
    paths.push(url.pathname)
    if (url.pathname.endsWith('/get')) {
      return { status: 200, text: JSON.stringify({ error: 0, data: { type: 5, token: 'fixture-token', waitTime: 300 } }) }
    }
    const proof = JSON.parse(url.searchParams.get('data') ?? '{}')
    assert.equal(decodeSyntheticProofPosition(proof.p, 'fixture-token'), '0,0,2000')
    return { status: 200, text: JSON.stringify({ error: 0, data: { result: true, token: 'fixture-token', validate: 'fixture-validate' } }) }
  } }
  const prepared = await prepareSmartCaptcha(session, 'fixture-captcha-id', { ...options, preparedAt: origin })
  assert.deepEqual(paths, ['/api/v3/get'])
  // Controlled test clock represents time spent entering phone/confirming.
  now += 2000
  assert.ok((await prepared.verify()).startsWith('CN31_'))
  await assert.rejects(prepared.verify(), /已提交/)
  assert.deepEqual(paths, ['/api/v3/get', '/api/v3/check'])
})

test('两个并发 verify 只执行一次逻辑校验；重试重新取挑战而不复用旧挑战', async () => {
  const paths: string[] = []
  const session = { request: async (input: string) => {
    const url = new URL(input)
    paths.push(url.pathname)
    return { status: 200, text: JSON.stringify({ error: 0, data: url.pathname.endsWith('/get')
      ? { type: 5, token: 'fixture-token', waitTime: 0 }
      : { result: false } }) }
  } }
  const prepared = await prepareSmartCaptcha(session, 'fixture-captcha-id', {
    ...options, retry: { maxCheckAttempts: 3, retryDelayMs: 0 },
  })
  const results = await Promise.allSettled([prepared.verify(), prepared.verify()])
  assert.ok(results.every((result) => result.status === 'rejected'))
  assert.deepEqual(paths, ['/api/v3/get', '/api/v3/check', '/api/v3/get', '/api/v3/check', '/api/v3/get', '/api/v3/check'])
  await assert.rejects(prepared.verify(), /已提交/)
  assert.equal(paths.length, 6)
})

test('反作弊拒绝响应不能被当作已认证 token', () => {
  const session = new UrsAnticheatSession({ productNumber: 'fixture-product' })
  session.buildDeviceForm()
  assert.throws(() => session.acceptDeviceResponse([470, 0]), /rejected/)
  assert.throws(() => session.getToken(), /not verified/)
})
