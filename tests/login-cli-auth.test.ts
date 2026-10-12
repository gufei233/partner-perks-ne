import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseLoginOptions } from '../src/login/login-cli.ts'
import { getAuth } from '../src/api.ts'

test('登录预检参数明确区分初始化和验证码完整检查', () => {
  assert.deepEqual(parseLoginOptions(['--preflight', '--check-captcha']), { preflight: true, checkCaptcha: true })
  assert.throws(() => parseLoginOptions(['--check-captcha']), /必须与 --preflight/)
  assert.throws(() => parseLoginOptions(['--phone']), /缺少参数/)
  assert.throws(() => parseLoginOptions(['--replace', '0']), /正整数/)
  assert.throws(() => parseLoginOptions(['--replace', '1.5']), /正整数/)
  assert.throws(() => parseLoginOptions(['--unknown']), /未知登录参数/)
})

test('业务登录响应未重复设置 XSRF 时保留本次请求值', async (t) => {
  let requestedXsrf = ''
  t.mock.method(globalThis, 'fetch', async (_input: unknown, options: RequestInit) => {
    const headers = new Headers(options.headers)
    requestedXsrf = headers.get('gl-x-xsrf-token') ?? ''
    assert.ok(requestedXsrf)
    assert.ok(headers.get('cookie')?.includes(`GL-XSRF-TOKEN=${requestedXsrf}`))
    assert.equal(headers.get('gl-checksum'), null)
    assert.equal(options.body, undefined)
    const responseHeaders = new Headers()
    responseHeaders.append('Set-Cookie', 'JSESSIONID=fixture-session; Path=/')
    responseHeaders.append('Set-Cookie', 'GOD_UUID=fixture-uid; Path=/')
    return new Response('{"code":200}', { headers: responseHeaders })
  })
  const auth = await getAuth('fixture-passport')
  assert.equal(auth.xsrfToken, requestedXsrf)
  assert.equal(auth.jSessionId, 'fixture-session')
})

test('HTTP 200 且带 Cookie，但业务失败仍拒绝刷新会话', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{"code":836}', { headers: { 'set-cookie': 'JSESSIONID=fixture-session; Path=/' } }))
  await assert.rejects(getAuth('fixture-passport'), /code: 836/)
})
