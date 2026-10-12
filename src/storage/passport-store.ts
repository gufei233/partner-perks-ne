import { randomBytes } from 'node:crypto'
import { existsSync, lstatSync, openSync, closeSync, fsyncSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parse, type ParseError } from 'jsonc-parser'

function assertRegularFile(path: string): void {
  if (!existsSync(path)) return
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('凭证路径必须是普通文件')
}

/** 登录与抢券共用的格式：每项是一个手机号的 NTES_YD_PASSPORT。 */
export function readPassports(path: string, allowMissing = false): string[] {
  const absolute = resolve(path)
  assertRegularFile(absolute)
  if (allowMissing && !existsSync(absolute)) return []
  const text = readFileSync(absolute, 'utf8')
  const errors: ParseError[] = []
  const value: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length || !Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error('passport.jsonc 必须是非空字符串组成的 JSON 数组；原文件未被覆盖')
  }
  return value as string[]
}

/** 原子更新；同一时刻只允许一个登录进程保存，避免丢失已有账号。replace 使用从 1 开始的账号序号。 */
export function savePassport(path: string, passport: string, replace?: number): { index: number; count: number } {
  if (!passport || /[\r\n;]/.test(passport)) throw new Error('登录未返回有效的 NTES_YD_PASSPORT')
  if (replace !== undefined && (!Number.isSafeInteger(replace) || replace < 1)) throw new Error('--replace 必须是正整数')
  const absolute = resolve(path)
  const lock = `${absolute}.lock`
  let lockFd: number
  try {
    lockFd = openSync(lock, 'wx', 0o600)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('另一个登录进程正在保存凭证，请稍后重试；若上次异常退出，请核对后清理 passport.jsonc.lock')
    throw err
  }
  const temporary = resolve(dirname(absolute), `.passport-${process.pid}-${randomBytes(8).toString('hex')}.tmp`)
  let tempCreated = false
  try {
    const passports = readPassports(absolute, true)
    if (replace !== undefined && replace > passports.length) throw new Error('--replace 指定的账号不存在；原文件未被覆盖')
    const duplicate = passports.indexOf(passport)
    if (duplicate >= 0 && replace === undefined) return { index: duplicate + 1, count: passports.length }
    const index = replace === undefined ? passports.length : replace - 1
    passports[index] = passport
    const fd = openSync(temporary, 'wx', 0o600)
    tempCreated = true
    try {
      writeFileSync(fd, `${JSON.stringify(passports, null, 2)}\n`, 'utf8')
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    assertRegularFile(absolute)
    renameSync(temporary, absolute)
    tempCreated = false
    return { index: index + 1, count: passports.length }
  } finally {
    if (tempCreated) unlinkSync(temporary)
    closeSync(lockFd)
    unlinkSync(lock)
  }
}
