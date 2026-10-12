import { readPassports } from '../src/storage/passport-store.ts'

try {
  const accounts = readPassports('passport.jsonc', true)
  if (!accounts.length) {
    console.log('尚未配置 Passport，跳过本次定时抢券；请先配置有效账号。')
    // systemd ExecCondition treats exit 1 as a skipped unit, not a failed job.
    process.exitCode = 1
  } else {
    console.log(`账号检查通过：已配置 ${accounts.length} 个账号。`)
  }
} catch {
  console.error('Passport 配置无效，跳过本次定时抢券；请检查配置格式和权限。')
  process.exitCode = 1
}
