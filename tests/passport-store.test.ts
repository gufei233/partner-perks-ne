import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { readPassports, savePassport } from '../src/storage/passport-store.ts'

const root = resolve('.tmp/passport-tests')
mkdirSync(root, { recursive: true })
function fixture(run: (file: string) => void): void {
  const directory = mkdtempSync(join(root, 'case-'))
  const file = join(directory, 'passport.jsonc')
  try { run(file) } finally {
    assert.ok(directory.startsWith(`${root}\\`) || directory.startsWith(`${root}/`))
    rmSync(directory, { recursive: true, force: true })
  }
}

test('新登录追加账号，更新指定账号时不覆盖其他账号', () => fixture((file) => {
  assert.deepEqual(savePassport(file, 'first-secret'), { index: 1, count: 1 })
  savePassport(file, 'second-secret')
  assert.deepEqual(savePassport(file, 'renewed-first', 1), { index: 1, count: 2 })
  assert.deepEqual(readPassports(file), ['renewed-first', 'second-secret'])
  assert.deepEqual(savePassport(file, 'second-secret'), { index: 2, count: 2 })
}))

test('JSONC 注释和尾逗号可以读取', () => fixture((file) => {
  writeFileSync(file, '// comment\n["first-secret",]')
  assert.deepEqual(readPassports(file), ['first-secret'])
}))

test('格式损坏、非法账号项均保留原文件', () => fixture((file) => {
  for (const text of ['["old-secret", BROKEN]', '[null]', '[123]', '[""]', '{}']) {
    writeFileSync(file, text)
    assert.throws(() => savePassport(file, 'new-secret'), /原文件未被覆盖/)
    assert.equal(readFileSync(file, 'utf8'), text)
  }
}))

test('越界替换失败，不丢失已有账号', () => fixture((file) => {
  savePassport(file, 'first-secret')
  assert.throws(() => savePassport(file, 'replacement', 2), /不存在/)
  assert.deepEqual(readPassports(file), ['first-secret'])
  assert.throws(() => savePassport(file, 'replacement', 0), /正整数/)
}))

test('保存锁阻止两个登录进程互相覆盖', () => fixture((file) => {
  savePassport(file, 'first-secret')
  writeFileSync(`${file}.lock`, '')
  assert.throws(() => savePassport(file, 'second-secret'), /另一个登录进程/)
  assert.deepEqual(readPassports(file), ['first-secret'])
}))

test('缺失配置只在登录保存阶段作为空数组处理', () => fixture((file) => {
  assert.deepEqual(readPassports(file, true), [])
  assert.throws(() => readPassports(file), { code: 'ENOENT' })
}))
