import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { UrsSmsLogin } from '../src/login/sms-login.ts'
import { decryptUrsParams } from '../src/login/urs/urs-crypto.ts'

const PHONE = '13800000000' // fixture only; every test replaces fetch, no network.
function json(value: unknown, cookies: string[] = [], status = 200): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)
  return new Response(JSON.stringify(value), { status, headers })
}

test('初始化只调用配置和 ini，不发送短信', async (t) => {
  const paths: string[] = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
    const path = new URL(input).pathname
    paths.push(path)
    return json(path.endsWith('getConf') ? { ret: '201' } : { ret: '201', capFlag: 6, capId: 'fixture-cap-id', pv: true })
  })
  const client = new UrsSmsLogin()
  assert.deepEqual(await client.begin(), { capFlag: 6, requiresPower: true })
  assert.deepEqual(paths, ['/dl/getConf', '/dl/dlzc/yd/ini'])
  await assert.rejects(client.begin(), /重复初始化/)
})

test('短信提交必须在验证码校验后，并发送新的计算挑战对象', async (t) => {
  const paths: string[] = []
  let sendPayload: Record<string, unknown> | undefined
  t.mock.method(globalThis, 'fetch', async (input: string | URL, options: RequestInit) => {
    const path = new URL(input).pathname
    paths.push(path)
    if (path.endsWith('getConf')) return json({ ret: '201' })
    if (path.endsWith('/ini')) return json({ ret: '201', capFlag: 6, capId: 'fixture-cap-id', pv: true })
    if (path.endsWith('/powGetP')) return json({ ret: '201', pVInfo: { needCheck: true, hashFunc: 'VDF_FUNCTION', sid: 'fresh-fixture-sid', minTime: 0, maxTime: 10, args: { mod: '61', x: '2', t: 2, puzzle: 'fresh-fixture-puzzle' } } })
    const payload = decryptUrsParams(JSON.parse(String(options.body)).encParams)
    assert.equal(payload.un, PHONE)
    assert.equal(payload.pd, 'godlike_web')
    assert.equal(payload.channel, 14)
    assert.equal(payload.pkht, 'ds.163.com')
    if (path.endsWith('/vfscp')) assert.equal(payload.cap, 'fresh-fixture-validate')
    if (path.endsWith('/sms/sm')) sendPayload = payload
    return json({ ret: '201' })
  })
  const client = new UrsSmsLogin({ captchaSolver: async () => 'fresh-fixture-validate', powerSolver: () => ({ puzzle: 'fresh-fixture-puzzle', sid: 'fresh-fixture-sid', runTimes: 2, spendTime: 0, args: '{"x":"10","t":2,"sign":0}' }) })
  await client.begin()
  await client.sendSms(PHONE)
  assert.ok(paths.indexOf('/dl/dlzc/yd/vfscp') < paths.indexOf('/dl/dlzc/yd/sms/sm'))
  assert.equal(typeof sendPayload?.pVParam, 'object')
  assert.equal(sendPayload?.cap, undefined)
  await assert.rejects(client.sendSms(PHONE), /不自动重复发送/)
})

test('并发发送在异步验证码准备前即被拒绝，只提交一次短信请求', async (t) => {
  let sent = 0
  let completeProof: (value: string) => void = () => {}
  const proof = new Promise<string>((resolve) => { completeProof = resolve })
  t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
    const path = new URL(input).pathname
    if (path.endsWith('getConf')) return json({ ret: '201' })
    if (path.endsWith('/ini')) return json({ ret: '201', capFlag: 6, capId: 'fixture-cap-id', pv: false })
    if (path.endsWith('/vfscp')) return json({ ret: '201' })
    if (path.endsWith('/sms/sm')) { sent++; return json({ ret: '201' }) }
    throw new Error('unexpected request')
  })
  const client = new UrsSmsLogin({ captchaSolver: async () => proof })
  await client.begin()
  const first = client.sendSms(PHONE)
  await assert.rejects(client.sendSms(PHONE), /不自动重复发送/)
  completeProof('fresh-fixture-validate')
  await first
  assert.equal(sent, 1)
})

test('发送结果不确定时，不重发也不允许假定成功后验证', async (t) => {
  let sent = 0
  t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
    const path = new URL(input).pathname
    if (path.endsWith('getConf')) return json({ ret: '201' })
    if (path.endsWith('/ini')) return json({ ret: '201', capFlag: 0, pv: false })
    if (path.endsWith('/sms/sm')) { sent++; throw new Error('fixture network uncertainty') }
    throw new Error('unexpected request')
  })
  const client = new UrsSmsLogin()
  await client.begin()
  await assert.rejects(client.sendSms(PHONE), /network uncertainty/)
  await assert.rejects(client.sendSms(PHONE), /不自动重复发送/)
  await assert.rejects(client.verifySms('123456'), /先主动发送/)
  assert.equal(sent, 1)
})

function successfulFixture(t: TestContext, userCode: number, account = PHONE, fixture: {
  loginUid?: string; userUid?: string; loginAccount?: string; userAccount?: string; xsrf?: string
} = {}): void {
  t.mock.method(globalThis, 'fetch', async (input: string | URL, options: RequestInit) => {
    const path = new URL(input).pathname
    if (path.endsWith('getConf')) return json({ ret: '201' })
    if (path.endsWith('/ini')) return json({ ret: '201', capFlag: 0, pv: false })
    if (path.endsWith('/sms/sm')) return json({ ret: '201' })
    if (path.endsWith('/gt')) return json({ ret: '201', tk: 'fixture-ticket' })
    if (path.endsWith('/sms/vfsms')) {
      const payload = decryptUrsParams(JSON.parse(String(options.body)).encParams)
      assert.equal(payload.sms, '123456')
      assert.equal(payload.tk, 'fixture-ticket')
      assert.equal(payload.l, 1)
      assert.equal(payload.d, 30)
      assert.equal(payload.domains, '')
      return json({ ret: '201' }, ['NTES_YD_PASSPORT=fixture-passport; Domain=.163.com; Path=/; HttpOnly'])
    }
    if (path.endsWith('/base/login')) {
      assert.equal(options.body, undefined)
      assert.equal(new Headers(options.headers).get('gl-checksum'), null)
      return json({ code: 200, result: { showAccount: PHONE, account: fixture.loginAccount ?? 'fixture-account', user: { uid: fixture.loginUid ?? 'fixture-uid' } } }, [
        'JSESSIONID=fixture-session; Domain=.ds.163.com; Path=/',
        'GOD_UUID=fixture-uid; Domain=.ds.163.com; Path=/',
        ...(fixture.xsrf ? [`GL-XSRF-TOKEN=${fixture.xsrf}; Path=/; Secure`] : []),
      ])
    }
    if (path.endsWith('/userInfo')) {
      if (fixture.xsrf) {
        const headers = new Headers(options.headers)
        assert.equal(headers.get('gl-x-xsrf-token'), fixture.xsrf)
        assert.ok(headers.get('cookie')?.includes(`GL-XSRF-TOKEN=${fixture.xsrf}`))
      }
      return json({ code: userCode, result: { showAccount: account, account: fixture.userAccount ?? 'fixture-account', user: { uid: fixture.userUid ?? 'fixture-uid' } } })
    }
    throw new Error('unexpected request')
  })
}

test('取得 Cookie 后还必须校验业务登录和同一手机号', async (t) => {
  successfulFixture(t, 200)
  const client = new UrsSmsLogin()
  await client.begin()
  await client.sendSms(PHONE)
  const result = await client.verifySms('123456')
  assert.equal(result.passport, 'fixture-passport')
  assert.equal(result.account, PHONE)
  assert.equal(result.auth.jSessionId, 'fixture-session')
  assert.ok(result.auth.xsrfToken)
})

test('已取得 Passport 但 userInfo 失败，不把登录标成成功', async (t) => {
  successfulFixture(t, 836)
  const client = new UrsSmsLogin()
  await client.begin()
  await client.sendSms(PHONE)
  await assert.rejects(client.verifySms('123456'), /账号信息校验未成功/)
})

test('业务接口返回其他手机号时拒绝保存', async (t) => {
  successfulFixture(t, 200, '13900000000')
  const client = new UrsSmsLogin()
  await client.begin()
  await client.sendSms(PHONE)
  await assert.rejects(client.verifySms('123456'), /不一致/)
})

for (const [name, overrides] of [
  ['业务登录 UID', { loginUid: 'other-fixture-uid' }],
  ['账号查询 UID', { userUid: 'other-fixture-uid' }],
] as const) {
  test(`${name} 与 GOD_UUID 不一致时拒绝保存`, async (t) => {
    successfulFixture(t, 200, PHONE, overrides)
    const client = new UrsSmsLogin()
    await client.begin()
    await client.sendSms(PHONE)
    await assert.rejects(client.verifySms('123456'), /UID 与会话 Cookie 不一致/)
  })
}

test('两次业务响应账号标识不同，即使手机号和 UID 相同也拒绝保存', async (t) => {
  successfulFixture(t, 200, PHONE, { userAccount: 'other-fixture-account' })
  const client = new UrsSmsLogin()
  await client.begin()
  await client.sendSms(PHONE)
  await assert.rejects(client.verifySms('123456'), /账号查询返回的账号不一致/)
})

test('含额外字符的手机号不能在删除字符后被误认为同一账号', async (t) => {
  successfulFixture(t, 200, `unexpected-${PHONE}`)
  const client = new UrsSmsLogin()
  await client.begin()
  await client.sendSms(PHONE)
  await assert.rejects(client.verifySms('123456'), /输入手机号不一致/)
})

test('预先准备挑战不发短信；确认后先计算 VDF，再 check、vfscp 和发送', async (t) => {
  const events: string[] = []
  let preparations = 0
  t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
    const path = new URL(input).pathname
    if (path.endsWith('getConf')) return json({ ret: '201' })
    if (path.endsWith('/ini')) return json({ ret: '201', capFlag: 6, capId: 'fixture-cap-id', pv: true })
    if (path.endsWith('/powGetP')) {
      events.push('powGetP')
      return json({ ret: '201', pVInfo: { needCheck: true } })
    }
    if (path.endsWith('/vfscp')) { events.push('vfscp'); return json({ ret: '201' }) }
    if (path.endsWith('/sms/sm')) { events.push('sms'); return json({ ret: '201' }) }
    throw new Error('Unexpected request')
  })
  const client = new UrsSmsLogin({
    captchaPreparer: async () => {
      preparations++
      events.push('get')
      return { verify: async () => { events.push('check'); return 'fixture-validate' } }
    },
    powerSolver: () => {
      events.push('calculate')
      return { sid: 'fixture-sid', puzzle: 'fixture-puzzle', runTimes: 1, spendTime: 1, args: '{}' }
    },
  })
  await client.begin()
  await client.prepareCaptcha()
  await client.prepareCaptcha() // Already prepared: no second get or check.
  assert.deepEqual(events, ['get'])
  await client.sendSms(PHONE)
  assert.equal(preparations, 1)
  assert.deepEqual(events, ['get', 'powGetP', 'calculate', 'check', 'vfscp', 'sms'])
})

test('完整预检取得真实计算挑战时不提交 un，验证码拒绝后不触发短信', async (t) => {
  const events: string[] = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL, init: RequestInit) => {
    const path = new URL(input).pathname
    if (path.endsWith('getConf')) return json({ ret: '201' })
    if (path.endsWith('/ini')) return json({ ret: '201', capFlag: 6, capId: 'fixture-cap-id', pv: true })
    if (path.endsWith('/powGetP')) {
      assert.equal(decryptUrsParams(JSON.parse(String(init.body)).encParams).un, undefined)
      events.push('powGetP')
      return json({ ret: '201', pVInfo: { needCheck: true } })
    }
    throw new Error('Preflight must never send SMS')
  })
  const client = new UrsSmsLogin({
    captchaPreparer: async () => {
      events.push('get')
      return { verify: async () => { events.push('check'); throw new Error('fixture result=false') } }
    },
    powerSolver: () => {
      events.push('calculate')
      return { sid: 'fixture-sid', puzzle: 'fixture-puzzle', runTimes: 1, spendTime: 1, args: '{}' }
    },
  })
  await client.begin()
  await assert.rejects(client.checkCaptcha(), /result=false/)
  assert.deepEqual(events, ['get', 'powGetP', 'calculate', 'check'])
})

test('业务登录轮换 XSRF 后，账号查询和返回 auth 使用新值', async (t) => {
  successfulFixture(t, 200, PHONE, { xsrf: 'fixture-rotated-xsrf' })
  const client = new UrsSmsLogin()
  await client.begin()
  await client.sendSms(PHONE)
  const result = await client.verifySms('123456')
  assert.equal(result.auth.xsrfToken, 'fixture-rotated-xsrf')
})
