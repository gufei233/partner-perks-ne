import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decryptUrsParams, encryptUrsParams, sm4KnownVector } from '../src/login/urs/urs-crypto.ts'
import { calculateVdf, createVdfPowerParam, powSign } from '../src/login/urs/urs-pow.ts'

test('SM4 通过 GB/T 32907 标准公开向量', () => {
  assert.equal(sm4KnownVector(), '681edf34d206965e86b3e94f536e4246')
})

test('URS 参数使用 UTF-8 JSON、十六进制密文，Unicode/填充边界可以往返', () => {
  for (const note of ['', '1234567890123456', '中文说明\n', 'x'.repeat(64)]) {
    const payload = { pd: 'godlike_web', pkid: 'fDydrIe', channel: 14, note }
    const encrypted = encryptUrsParams(payload)
    assert.match(encrypted, /^[0-9a-f]+$/)
    assert.equal(encrypted.length % 32, 0)
    assert.deepEqual(decryptUrsParams(encrypted), payload)
  }
  assert.throws(() => decryptUrsParams('not-hex'))
  assert.throws(() => decryptUrsParams('00'))
})

test('VDF 签名的 MurmurHash3 与公开向量一致', () => {
  assert.equal(powSign('', 0), 0)
  assert.equal(powSign('hello', 0), 613153351)
  assert.equal(powSign('foo', 0), 4138058784)
})

test('VDF 重复平方结果和提交格式符合挑战契约', () => {
  const challenge = { hashFunc: 'VDF_FUNCTION' as const, sid: 'fixture-sid', minTime: 0, maxTime: 1000, args: { puzzle: 'fixture-puzzle', mod: '61', x: '2', t: 10 } }
  const result = calculateVdf(challenge, { now: () => 0 })
  let expected = 2n
  for (let i = 0; i < 10; i++) expected = expected * expected % 97n
  assert.equal(JSON.parse(result.args).x, expected.toString(16))
  assert.equal(result.runTimes, 10)
  assert.equal(result.spendTime, 0)
  assert.deepEqual(Object.keys(result).sort(), ['args', 'puzzle', 'runTimes', 'sid', 'spendTime'])
  assert.deepEqual(result, createVdfPowerParam(challenge, expected.toString(16), 10, 0))
})

test('VDF 不接受异常资源预算或回拨时钟', () => {
  const challenge = { hashFunc: 'VDF_FUNCTION' as const, sid: 'fixture-sid', minTime: 1, maxTime: 2, args: { puzzle: 'fixture-puzzle', mod: '61', x: '2', t: 10 } }
  assert.throws(() => calculateVdf({ ...challenge, maxTime: 60000 }), /budget/)
  let clock = 10
  assert.throws(() => calculateVdf(challenge, { now: () => clock-- }), /monotonic/)
})
