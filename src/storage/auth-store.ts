import { chmodSync, closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { AuthType } from '../api.ts'

export type SavedAuth = AuthType & { passportIndex: number }
function assertRegular(path: string): void {
  if (existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())) throw new Error('auth 路径必须是普通文件')
}
export function writePrivateJson(path: string, value: unknown): void {
  const target = resolve(path)
  assertRegular(target)
  const temporary = resolve(dirname(target), `.auth-${process.pid}-${randomBytes(8).toString('hex')}.tmp`)
  try {
    const fd = openSync(temporary, 'wx', 0o600)
    try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd) } finally { closeSync(fd) }
    assertRegular(target)
    renameSync(temporary, target)
    chmodSync(target, 0o600)
  } finally { if (existsSync(temporary)) unlinkSync(temporary) }
}
export function readAuths(path: string): SavedAuth[] {
  assertRegular(path)
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(value) || !value.length) throw new Error('auth.json 为空或无效；请先运行 auth')
  const indices = new Set<number>()
  return value.map((item: unknown, index: number) => {
    if (!item || typeof item !== 'object') throw new Error('auth.json 凭证格式无效')
    const v = item as Record<string, unknown>
    // Existing array files remain readable; new writes always preserve original account indices.
    const passportIndex = v.passportIndex ?? index
    if (typeof passportIndex !== 'number' || !Number.isSafeInteger(passportIndex) || passportIndex < 0 || indices.has(passportIndex)) throw new Error('auth.json 账号编号无效')
    indices.add(passportIndex)
    for (const field of ['xsrfToken', 'jSessionId', 'glUid']) {
      if (typeof v[field] !== 'string' || /[\r\n;]/.test(v[field])) throw new Error('auth.json 凭证字段无效')
    }
    if (!v.xsrfToken || !v.jSessionId) throw new Error('auth.json 缺少必需凭证')
    return { xsrfToken: v.xsrfToken as string, jSessionId: v.jSessionId as string, glUid: v.glUid as string, passportIndex }
  })
}
