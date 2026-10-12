import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ProtocolSession, parseProtocolJson, LOGIN_USER_AGENT } from '../src/login/protocol-session.ts'

test('协议 HTTP 身份明确报告当前 Node 运行环境', async (t) => {
  assert.ok(LOGIN_USER_AGENT.includes(`Node.js/${process.versions.node}`))
  assert.ok(LOGIN_USER_AGENT.includes(process.platform))
  assert.ok(!LOGIN_USER_AGENT.includes('Chrome/'))
  t.mock.method(globalThis, 'fetch', async (_input: string | URL, init: RequestInit) => {
    assert.equal(new Headers(init.headers).get('User-Agent'), LOGIN_USER_AGENT)
    return new Response('{"ret":"201"}')
  })
  await new ProtocolSession().request('https://dl.reg.163.com/dl/dlzc/yd/ini')
})

test('只解析合法 JSONP，不执行追加的 JavaScript', () => {
  assert.deepEqual(parseProtocolJson('URSJSONP123({"ret":"201"})\n'), { ret: '201' })
  assert.deepEqual(parseProtocolJson('{"ret":"401"}'), { ret: '401' })
  assert.throws(() => parseProtocolJson('callback({});process.exit(0)'), /无法解析/)
  assert.throws(() => parseProtocolJson('callback({broken})'), /无法解析/)
})

test('跨登录步骤沿用符合目标域的 Cookie', async (t) => {
  const calls: Array<{ url: string; cookie: string }> = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL, init: RequestInit) => {
    const headers = new Headers(init.headers)
    calls.push({ url: String(input), cookie: headers.get('cookie') ?? '' })
    return new Response('{"ret":"201"}', {
      headers: calls.length === 1 ? { 'set-cookie': 'NTES_YD_PASSPORT=fixture-secret; Domain=.163.com; Path=/; Secure; HttpOnly' } : {},
    })
  })
  const session = new ProtocolSession()
  await session.request('https://dl.reg.163.com/dl/dlzc/yd/ini')
  await session.request('https://inf.ds.163.com/v1/web/base/login', { method: 'POST' })
  assert.equal(calls[1]?.cookie, 'NTES_YD_PASSPORT=fixture-secret')
  assert.equal(await session.cookie('NTES_YD_PASSPORT', 'https://inf.ds.163.com'), 'fixture-secret')
})

test('短信接口出现网络错误时不自动重发', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('fixture transport failure') })
  await assert.rejects(new ProtocolSession().request('https://dl.reg.163.com/dl/dlzc/yd/sms/sm', { method: 'POST', body: '{}' }), /fixture transport/)
  assert.equal(calls, 1)
})

test('跳转到非官方允许域时，不继续转发登录请求', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return new Response('', { status: 307, headers: { location: 'https://attacker.invalid/' } })
  })
  await assert.rejects(new ProtocolSession().request('https://dl.reg.163.com/dl/dlzc/yd/sms/vfsms', { method: 'POST', body: 'fixture' }), /未支持的跳转/)
  assert.equal(calls, 1)
})
