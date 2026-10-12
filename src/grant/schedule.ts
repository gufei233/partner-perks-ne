/** Return the target in server epoch, using the process timezone (TZ=Asia/Shanghai on deployment). */
export function targetServerEpoch(at: string, serverNow: number): number {
  if (at === 'now') return serverNow + 200
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(at)
  if (!match) throw new Error('--at 应为 HH:MM[:SS] 或 now')
  const hours = Number(match[1]), minutes = Number(match[2]), seconds = Number(match[3] ?? 0)
  if (hours > 23 || minutes > 59 || seconds > 59 || !Number.isFinite(serverNow)) throw new Error('--at 时刻非法')
  const target = new Date(serverNow)
  target.setHours(hours, minutes, seconds, 0)
  if (target.getTime() <= serverNow) target.setDate(target.getDate() + 1)
  return target.getTime()
}

export function validateLoginWarmup(at: string, fromAuthFile: boolean, warmupSeconds: number): void {
  if (at !== 'now' && !fromAuthFile && warmupSeconds < 1) {
    throw new Error('定时登录的 --warmup 至少为 1 秒；使用已有会话时可指定 --from-auth-file')
  }
}
