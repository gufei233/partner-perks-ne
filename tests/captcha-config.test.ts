import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ProtocolSession } from '../src/login/protocol-session.ts'
import { solveSmartCaptcha, type CaptchaObservation } from '../src/login/urs/urs-captcha.ts'

const CAPTCHA_ID = 'fixture-captcha-id'

for (const [name, features] of [
  ['未提供可选 ac 配置', {}],
  ['明确禁用 Watchman 和 IR', { ac: { enable: 2 }, ir: { enable: 2 } }],
] as const) {
  test(`${name} 时不调用 Watchman，仍以最终 check 响应判定成功`, async (t) => {
    const paths: string[] = []
    const events: CaptchaObservation[] = []
    t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
      const url = new URL(input)
      paths.push(url.pathname)
      assert.equal(url.hostname, 'webzjcaptcha.reg.163.com')
      assert.equal(url.searchParams.get('id'), CAPTCHA_ID)
      let data: unknown
      if (url.pathname === '/api/v2/getconf') {
        data = { zoneId: 'CN31', ...features }
      } else if (url.pathname === '/api/v3/get') {
        assert.equal(url.searchParams.get('acToken'), '')
        assert.ok(url.searchParams.get('fp'))
        data = { type: 5, token: 'fixture-challenge-token', waitTime: 0 }
      } else if (url.pathname === '/api/v3/check') {
        assert.equal(url.searchParams.get('token'), 'fixture-challenge-token')
        data = { result: true, token: 'fixture-challenge-token', validate: 'fixture-server-validate' }
      } else {
        throw new Error('Unexpected request in mocked config test')
      }
      return new Response(JSON.stringify({ error: 0, data }))
    })
    const validate = await solveSmartCaptcha(new ProtocolSession(), CAPTCHA_ID, { report: (event) => events.push(event) })
    assert.ok(validate.startsWith('CN31_'))
    assert.deepEqual(paths, ['/api/v2/getconf', '/api/v3/get', '/api/v3/check'])
    assert.deepEqual(events, [
      { stage: 'config', accepted: true },
      { stage: 'challenge', accepted: true, challengeType: 5 },
      { stage: 'check', accepted: true, attempt: 1 },
    ])
  })
}

test('IR 启用时即使 Watchman 也启用，不能忽略 IR 并继续提交挑战', async (t) => {
  const paths: string[] = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
    const url = new URL(input)
    paths.push(url.pathname)
    if (paths.length > 1) throw new Error('Must stop after configuration')
    return new Response(JSON.stringify({ error: 0, data: {
      zoneId: 'CN31', ir: { enable: 1 }, ac: { enable: 1, pn: 'fixture-product', bid: 'fixture-business' },
    } }))
  })
  await assert.rejects(solveSmartCaptcha(new ProtocolSession(), CAPTCHA_ID), /已启用 IR 风险验证/)
  assert.deepEqual(paths, ['/api/v2/getconf'])
})

test('IR 禁用时沿用 Watchman 分支，设备和行为成功不能代替 check 成功', async (t) => {
  const paths: string[] = []
  const events: CaptchaObservation[] = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL, init: RequestInit) => {
    const url = new URL(input)
    paths.push(url.pathname)
    if (url.pathname === '/api/v2/getconf') {
      return new Response(JSON.stringify({ error: 0, data: {
        zoneId: 'CN31', ir: { enable: 2 }, ac: { enable: 1, pn: 'fixture-product', bid: 'fixture-business' },
      } }))
    }
    if (url.hostname === 'webzjac.reg.163.com') {
      assert.equal(init.method, 'POST')
      const form = new URLSearchParams(String(init.body))
      const callback = form.get('cb')
      assert.match(callback ?? '', /^__wmjsonp_[a-f0-9]{7}$/)
      const response = url.pathname === '/v3/d'
        ? [200, 0, 'fixture-device-transport', 'fixture-device-id']
        : [200, 0, 'fixture-behavior-transport']
      return new Response(`${callback}(${JSON.stringify(response)});`)
    }
    if (url.pathname === '/api/v3/get') {
      assert.match(url.searchParams.get('acToken') ?? '', /^[a-f0-9]+$/)
      return new Response(JSON.stringify({ error: 0, data: { type: 5, token: 'fixture-token', waitTime: 0 } }))
    }
    if (url.pathname === '/api/v3/check') {
      return new Response(JSON.stringify({ error: 0, data: { result: false, validate: '' } }))
    }
    throw new Error('Unexpected request in mocked Watchman test')
  })
  await assert.rejects(solveSmartCaptcha(new ProtocolSession(), CAPTCHA_ID, {
    report: (event) => events.push(event), retry: { maxCheckAttempts: 1, retryDelayMs: 0 },
  }), /result=false/)
  assert.deepEqual(paths, ['/api/v2/getconf', '/v3/d', '/v3/b', '/api/v3/get', '/api/v3/check'])
  assert.deepEqual(events, [
    { stage: 'config', accepted: true },
    { stage: 'device', accepted: true },
    { stage: 'behavior', accepted: true },
    { stage: 'challenge', accepted: true, challengeType: 5 },
    { stage: 'check', accepted: false, attempt: 1 },
  ])
})

test('形状损坏的可选配置不能被当成禁用后继续', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return new Response(JSON.stringify({ error: 0, data: { zoneId: 'CN31', ac: [] } }))
  })
  await assert.rejects(solveSmartCaptcha(new ProtocolSession(), CAPTCHA_ID), /配置结构异常/)
  assert.equal(calls, 1)
})
