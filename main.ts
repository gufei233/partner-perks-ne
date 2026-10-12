import { mkdirSync } from 'node:fs'
import { readAuths, writePrivateJson, type SavedAuth } from './src/storage/auth-store.ts'
import { deadlineSignal, waitForFire, runAccountGrants, grantReportFailed } from './src/grant/grant-runner.ts'
import { targetServerEpoch, validateLoginWarmup } from './src/grant/schedule.ts'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPassports } from './src/storage/passport-store.ts'
import {
  type CouponInfoType,
  epochNow,
  formatTime,
  getAuth,
  getServerClockOffsetMs,
  getSuperCoupons,
  sleepUntil,
} from './src/api.ts'

const here = dirname(fileURLToPath(import.meta.url))
const PASSPORT_FILE = resolve(here, 'passport.jsonc')
const AUTH_FILE = resolve(here, 'auth.json')
const LOG_DIR = resolve(here, 'logs')

const argv = process.argv.slice(2)
const command = argv[0] ?? 'help'

function log(msg: string) {
  console.log(`[${formatTime(new Date())}] ${msg}`)
}

function flagValue(name: string): string | undefined {
  const i = argv.indexOf(name)
  if (i === -1) return undefined
  const v = argv[i + 1]
  if (v === undefined || v.startsWith('--')) return undefined
  return v
}

function flagNumber(name: string, fallback: number): number {
  const v = flagValue(name)
  const n = v !== undefined ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

function loadPassports(): string[] {
  let list: string[]
  try {
    list = readPassports(PASSPORT_FILE)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('尚未配置账号：请先运行 npm run login，或按模板填写 passport.jsonc')
    throw err
  }
  if (!list.length) throw new Error('passport.jsonc 是空的：请先运行 npm run login 添加账号')
  return list
}

function reasonText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ---------------------------------------------------------------- auth 子命令：预登录

async function cmdAuth(): Promise<number> {
  const passports = loadPassports()
  log(`开始登录 ${passports.length} 个账号…`)
  const settled = await Promise.allSettled(passports.map((p) => getAuth(p)))
  const authList: SavedAuth[] = []
  let failed = 0
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      authList.push({ ...r.value, passportIndex: i })
      log(`账号 ${i + 1}/${passports.length}: 登录成功`)
      if (r.value.warning) log(`  警告: ${r.value.warning}`)
    } else {
      failed++
      log(`账号 ${i + 1}/${passports.length}: 登录失败 — ${reasonText(r.reason)}`)
    }
  })
  writePrivateJson(AUTH_FILE, authList)
  log(`凭证已写入 ${AUTH_FILE}（成功 ${authList.length}/${passports.length}）`)
  return authList.length ? 0 : 1
}

// ---------------------------------------------------------------- run 子命令：定时抢券

async function cmdRun(): Promise<number> {
  const atStr = flagValue('--at') ?? '00:00:00'
  const leadMs = flagNumber('--lead', 100)
  const warmupSec = flagNumber('--warmup', 60)
  const types = (flagValue('--types') ?? 'PHONE_REWARD')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const retries = flagNumber('--retries', 2)
  const retryDelayMs = flagNumber('--retry-delay', 150)
  const pingMs = flagNumber('--ping', 5000)
  const phase2DelayMs = flagNumber('--phase2-delay', 200)
  const fromAuthFile = argv.includes('--from-auth-file')

  // 参数范围校验：非法值会直接报错，而不是在 0 点静默跑偏
  const rangeChecks: [string, number, number, number][] = [
    ['--lead', leadMs, 0, 10_000],
    ['--warmup', warmupSec, 0, 3600],
    ['--retries', retries, 0, 10],
    ['--retry-delay', retryDelayMs, 0, 10_000],
    ['--ping', pingMs, 100, 60_000],
    ['--phase2-delay', phase2DelayMs, 0, 60_000],
  ]
  for (const [name, v, lo, hi] of rangeChecks) {
    if (v < lo || v > hi) throw new Error(`${name} 应在 ${lo}–${hi} 之间，收到 ${v}`)
  }

  validateLoginWarmup(atStr, fromAuthFile, warmupSec)
  if (!types.length || types.some(type => !['PHONE_REWARD', 'CODE', 'DIRECT_LINK'].includes(type))) throw new Error('--types 包含未知或空券类型')
  targetServerEpoch(atStr, epochNow()) // Validate the time format before any network call.
  const passports = fromAuthFile ? undefined : loadPassports()
  const storedAuths = fromAuthFile ? readAuths(AUTH_FILE) : undefined
  const offsetMs = await getServerClockOffsetMs()
  const targetEpoch = targetServerEpoch(atStr, epochNow() + offsetMs)
  const fireAtLocal = targetEpoch - leadMs - offsetMs
  log(
    `目标时刻 ${new Date(targetEpoch).toLocaleString('zh-CN', { hour12: false })}` +
      `${atStr === 'now' ? '（立即）' : ''}，时钟偏差 ${offsetMs >= 0 ? '+' : ''}${offsetMs.toFixed(0)}ms` +
      `，提前量 ${leadMs}ms → 本地开火时刻 ${new Date(fireAtLocal).toLocaleTimeString('zh-CN', { hour12: false })}.${String(new Date(fireAtLocal).getMilliseconds()).padStart(3, '0')}`,
  )

  // 2. 预热时刻到点后登录所有账号（若已过预热时刻则立即）
  const warmupStart = fireAtLocal - warmupSec * 1000
  let authList: SavedAuth[]
  if (fromAuthFile) {
    authList = storedAuths!
    log(`从 auth.json 加载 ${authList.length} 个凭证（跳过登录）`)
  } else {
    if (warmupStart > epochNow()) {
      log(`等待预热时刻（提前 ${warmupSec}s）…`)
      await sleepUntil(warmupStart)
    }
    const configured = passports!
    log(`登录 ${configured.length} 个账号…`)
    const loginDeadline = atStr === 'now' ? epochNow() + 15_000 : fireAtLocal - 100
    const settled = await Promise.allSettled(configured.map((p) => getAuth(p, { signal: deadlineSignal(loginDeadline, 15_000) })))
    authList = []
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        authList.push({ ...r.value, passportIndex: i })
        log(`账号 ${i + 1}/${configured.length}: 登录成功`)
        if (r.value.warning) log(`  警告: ${r.value.warning}`)
      } else {
        log(`账号 ${i + 1}/${configured.length}: 登录失败 — ${reasonText(r.reason)}（跳过该账号）`)
      }
    })
    if (!authList.length) {
      log('所有账号登录失败，放弃执行')
      return 1
    }
    try {
      writePrivateJson(AUTH_FILE, authList)
    } catch {
      // auth.json 写失败不影响抢券
    }
  }

  // 3. Preflight requests may not hold the fire deadline hostage.
  const grantOpts = { retries, retryDelayMs }
  const prefetchDeadline = atStr === 'now' ? epochNow() + 5000 : fireAtLocal - 100
  const prefetched = await Promise.allSettled(authList.map(auth =>
    getSuperCoupons(auth, { signal: deadlineSignal(prefetchDeadline, 5000) })
      .then(coupons => coupons.filter(c => types.includes(c.couponType ?? ''))),
  ))
  const preCoupons: CouponInfoType[][] = []
  const preErrors: (string | undefined)[] = []
  prefetched.forEach((result, i) => {
    const accountNumber = authList[i]!.passportIndex + 1
    if (result.status === 'fulfilled') {
      preCoupons[i] = result.value
      log(`账号 ${accountNumber}: 预取到 ${result.value.length} 张可领券`)
    } else {
      preCoupons[i] = []
      preErrors[i] = '预取查券失败（业务、网络或超时）'
      log(`账号 ${accountNumber}: ${preErrors[i]}`)
    }
  })
  await waitForFire(fireAtLocal, pingMs, log)

  log(`开火！${authList.length} 个账号，类型 [${types.join(', ')}]`)
  const firedAt = new Date()
  const settledResults = await Promise.allSettled(authList.map((auth, i) => runAccountGrants({
    auth, index: auth.passportIndex, pre: preCoupons[i] ?? [],
    ...(preErrors[i] ? { preflightError: preErrors[i] } : {}),
    types, fireAt: atStr === 'now' ? epochNow() : fireAtLocal, phase2DelayMs, grantOptions: grantOpts,
  })))
  const results = settledResults.map((result, i) => result.status === 'fulfilled' ? result.value : {
    index: authList[i]!.passportIndex, phase1: [], phase2: [], errors: ['账号领取执行异常'], querySucceeded: false,
  }).sort((a, b) => a.index - b.index)

  let totalOk = 0
  let totalFail = 0
  for (const result of results) {
    const all = [...result.phase1, ...result.phase2]
    totalOk += all.filter(g => g.ok).length
    totalFail += all.filter(g => !g.ok).length
    log(`<===== 账号 ${result.index + 1} =====> 提交 ${all.length} 次，成功 ${all.filter(g => g.ok).length}`)
    for (const error of result.errors) log(`  ${error}`)
    for (const grant of all) {
      const name = `${grant.coupon.brandName ?? grant.coupon.brandId} - ${grant.coupon.couponName ?? grant.coupon.couponId}`
      log(`  ${grant.ok ? '√' : '×'} ${name} — code ${grant.code ?? '响应不确定'}${grant.uncertain ? '（不重复提交）' : ''}`)
    }
  }
  log(`总计: 成功 ${totalOk}，失败提交 ${totalFail}`)
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    const logFile = resolve(LOG_DIR, `grant-${firedAt.toISOString().replace(/[:.]/g, '-')}.json`)
    writePrivateJson(logFile, { firedAt: firedAt.toISOString(), leadMs, offsetMs, results })
    log(`完整结果已写入 ${logFile}`)
  } catch { log('写结果日志失败') }
  return results.some(grantReportFailed) ? 1 : 0
}

// ---------------------------------------------------------------- help / 入口

function printHelp() {
  console.log(`网易会员中心超级券领取工具

用法:
  npm run login                      手机号验证码登录（纯 HTTP 协议）
  npm run auth                       用已保存 Passport 换取抢券会话
  npm run grant                      完整抢券流程（定时 + 保活 + 自动开火）
  npx tsx main.ts <command> [flags]

命令:
  login   纯协议短信登录，支持自动滑块；成功后保存 Passport，不调用领券接口
  auth    使用 Passport 换取抢券会话（提前几分钟或由 run 自动执行）
  run     一条命令完成: 时钟校准 → 预热登录 → 预取券列表 → 连接保活 → 0 点开火 → 补领 → 报告
  help    显示本帮助

login 的参数:
  --import-device <HAR>  导入自己的设备档案供登录使用，不导入历史验证码或账号凭证
  --preflight      只检查协议初始化，不发送短信或保存凭证
  --check-captcha  与 --preflight 合用，检查 VDF、智能验证及自动滑块回退
  --phone <手机号>  登录时预填；与 --preflight --check-captcha 合用时校验手机号绑定、不发送短信
  --replace <序号>  更新指定账号（从 1 开始），默认追加账号

run 的参数:
  --at HH:MM[:SS]   目标时刻，默认 00:00:00（当天已过则取明天）；--at now 立即执行（测试用）
  --lead <ms>       提前开火量，默认 100（按服务器时钟对齐后提前 100ms 发出）
  --warmup <sec>     提前多少秒开始登录+预热，默认 60
  --types <list>     券类型逗号分隔，默认 PHONE_REWARD；可选 CODE, DIRECT_LINK
  --retries <n>      每张券对网络错误/429/5xx 的重试次数，默认 2
  --retry-delay <ms> 重试间隔，默认 150
  --ping <ms>       开火前的保活 ping 间隔，默认 5000
  --phase2-delay <ms> 开火后二次扫描补领的延迟，默认 200；0 关闭
  --from-auth-file   跳过登录，直接用 auth.json 里的凭证（配合 auth 子命令用老流程）

示例:
  npm run grant                                  # 今晚 0 点自动抢 PHONE_REWARD 券
  npm run grant -- --at 10:00 --types PHONE_REWARD,CODE
  npm run grant -- --at now                      # 填好 passport 后立即试跑一次
  npm run auth && npm run grant -- --at 00:00:00 --from-auth-file`)
}

async function main(): Promise<number> {
  switch (command) {
    case 'login': {
      const { runSmsLogin } = await import('./src/login/login-cli.ts')
      return runSmsLogin(argv.slice(1), PASSPORT_FILE)
    }
    case 'auth':
      return cmdAuth()
    case 'run':
      return cmdRun()
    case 'help':
    case '--help':
    case '-h':
      printHelp()
      return 0
    default:
      console.error(`未知命令: ${command}\n`)
      printHelp()
      return 1
  }
}

try {
  process.exitCode = await main()
} catch (err) {
  console.error(`[错误] ${reasonText(err)}`)
  process.exitCode = 1
}
