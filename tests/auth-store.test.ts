import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readAuths, writePrivateJson } from '../src/storage/auth-store.ts'

test('私有会话文件保留原账号编号并收紧已存在的文件权限', () => {
  const directory = mkdtempSync(join(tmpdir(), 'perks-auth-test-'))
  const file = join(directory, 'auth.json')
  try {
    writeFileSync(file, '[]')
    chmodSync(file, 0o644)
    writePrivateJson(file, [{ passportIndex: 2, xsrfToken: 'fixture-xsrf', jSessionId: 'fixture-session', glUid: 'fixture-uid' }])
    assert.equal(readAuths(file)[0]?.passportIndex, 2)
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600)
    assert.ok(!readFileSync(file, 'utf8').includes('passport-value'))
  } finally { rmSync(directory, { recursive: true }) }
})
test('旧会话可读取，损坏或重复编号被拒绝', () => {
  const directory = mkdtempSync(join(tmpdir(), 'perks-auth-test-'))
  const file = join(directory, 'auth.json')
  const auth = { xsrfToken: 'fixture-xsrf', jSessionId: 'fixture-session', glUid: '' }
  try {
    writePrivateJson(file, [auth])
    assert.equal(readAuths(file)[0]?.passportIndex, 0)
    writePrivateJson(file, [{ ...auth, passportIndex: 1 }, { ...auth, passportIndex: 1 }])
    assert.throws(() => readAuths(file), /账号编号无效/)
    writePrivateJson(file, [{ ...auth, jSessionId: 'bad;injection' }])
    assert.throws(() => readAuths(file), /凭证字段无效/)
  } finally { rmSync(directory, { recursive: true }) }
})
