import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { dirname, resolve } from 'node:path'
import { readPassports, savePassport } from '../storage/passport-store.ts'
import { UrsSmsLogin, UrsLoginError } from './sms-login.ts'
import { ProtocolSession } from './protocol-session.ts'
import { readDeviceProfile, saveDeviceProfile } from './urs/urs-device.ts'

type LoginOptions = { preflight: boolean; checkCaptcha: boolean; phone?: string; replace?: number; importDevice?: string }

export function parseLoginOptions(args: string[]): LoginOptions {
  const options: LoginOptions = { preflight: false, checkCaptcha: false }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--preflight') { options.preflight = true; continue }
    if (arg === '--check-captcha') { options.checkCaptcha = true; continue }
    if (arg !== '--phone' && arg !== '--replace' && arg !== '--import-device') throw new Error(`未知登录参数：${arg ?? ''}`)
    const value = args[++i]
    if (!value || value.startsWith('--')) throw new Error(`${arg} 缺少参数`)
    if (arg === '--phone') {
      if (!/^1[3-9]\d{9}$/.test(value)) throw new Error('--phone 应为中国大陆的 11 位手机号')
      options.phone = value
    } else if (arg === '--replace') {
      if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('--replace 应为正整数账号序号')
      options.replace = Number(value)
    } else options.importDevice = value
  }
  if (options.checkCaptcha && !options.preflight) throw new Error('--check-captcha 必须与 --preflight 一起使用')
  if (options.preflight && options.phone && !options.checkCaptcha) throw new Error('预检查指定 --phone 时需同时使用 --check-captcha')
  if (options.importDevice && (options.preflight || options.phone || options.replace !== undefined)) {
    throw new Error('--import-device 单独使用；导入只读取设备档案，不执行登录')
  }
  return options
}

export async function runSmsLogin(args: string[], passportFile: string): Promise<number> {
  const options = parseLoginOptions(args)
  const deviceFile = resolve(dirname(passportFile), '.login-device.json')
  if (options.importDevice) {
    const { importDeviceFromHar } = await import('./urs/urs-device-import.ts')
    saveDeviceProfile(deviceFile, importDeviceFromHar(options.importDevice))
    console.log('已导入成功会话的设备档案；未导入账号 Cookie、短信码或验证码校验结果。')
    console.log('后续登录使用该设备档案，并重新获取本次会话挑战；不会复用历史验证码。')
    return 0
  }
  // 保存目标与账号序号先校验，避免短信已经发送后才发现本地配置损坏。
  const current = readPassports(passportFile, true)
  if (options.replace !== undefined && options.replace > current.length) throw new Error('--replace 指定的账号不存在')
  if (!options.preflight && !stdin.isTTY) {
    throw new Error('短信登录需要交互式终端输入验证码；SSH 请加 -t。只检查协议可使用 login --preflight')
  }
  const device = readDeviceProfile(deviceFile)
  if (device) console.log('已载入本地设备档案；验证码和校验结果将由服务端重新签发。')
  const client = new UrsSmsLogin({
    // Preserve the user's captured device identity; native Node collection has
    // no renderer and returns collector errors. Neither branch reuses validate.
    session: new ProtocolSession(device ? { device, saveDevice: profile => saveDeviceProfile(deviceFile, profile) } : {}),
    captchaPreparer: async (session, capId) => {
      const { prepareSmartCaptcha } = await import('./urs/urs-captcha.ts')
      return prepareSmartCaptcha(session, capId, {
        solveJigsaw: async (challenge) => {
          const { solveJigsawProtocol } = await import('./urs/urs-captcha-jigsaw.ts')
          return solveJigsawProtocol(challenge)
        },
        report: (event) => {
          const stages = { config: '验证码配置', device: '设备初始化', behavior: '反作弊会话', challenge: '验证码挑战', check: '验证码校验' }
          const type = event.challengeType === undefined ? '' : `，type=${event.challengeType}`
          const status = event.accepted ? '已接受' : '未接受'
          const attempt = event.stage === 'check' && event.attempt && event.attempt > 1 ? `（第 ${event.attempt} 次）` : ''
          console.log(`${stages[event.stage]}：${status}${type}${attempt}`)
        },
      })
    },
  })
  const initialize = async () => {
    console.log('正在初始化网易大神纯协议短信登录……')
    const preflight = await client.begin()
    console.log(`初始化成功：capFlag=${preflight.capFlag}，计算挑战=${preflight.requiresPower ? '需要' : '不需要'}`)
  }
  if (options.preflight) {
    await initialize()
    if (options.checkCaptcha) {
      console.log(options.phone ? '正在检查指定手机号的计算挑战、智能验证及绑定；不会发送短信……' : '正在检查新会话的计算挑战和智能验证……')
      await client.checkCaptcha(options.phone)
      console.log('验证码已取得本次服务端签发的结果。')
      if (options.phone) console.log('指定手机号的 URS 绑定校验已通过。')
    }
    console.log('协议检查完成；未发送短信、未提交短信验证码、未保存凭证。')
    return 0
  }
  const terminal = createInterface({ input: stdin, output: stdout })
  try {
    const phone = options.phone ?? (await terminal.question('手机号：')).trim()
    if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('请输入中国大陆的 11 位手机号')
    const masked = `${phone.slice(0, 3)}****${phone.slice(-4)}`
    const confirm = (await terminal.question(`向 ${masked} 发送登录验证码？输入 y 确认，其他输入取消：`)).trim().toLowerCase()
    if (confirm !== 'y') {
      console.log('已取消，没有发送短信。')
      return 0
    }
    // Start the protocol session after input, so confirmation cannot age its challenges.
    // sendSms prepares a fresh challenge, computes VDF and verifies it immediately.
    await initialize()
    console.log('正在准备后台智能验证挑战……')
    await client.sendSms(phone)
    console.log('官方接口确认短信发送成功。')
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = (await terminal.question('短信验证码（输入 q 取消）：')).trim()
      if (code.toLowerCase() === 'q') return 0
      if (!/^\d{6}$/.test(code)) {
        console.log('验证码应为 6 位数字。')
        continue
      }
      try {
        const result = await client.verifySms(code)
        const saved = savePassport(passportFile, result.passport, options.replace)
        console.log(`账号 ${masked} 已通过大神账号校验；凭证保存到第 ${saved.index} 项，共 ${saved.count} 个账号。`)
        console.log('后续定时抢券继续使用 npm run grant；本次登录没有调用领取接口。')
        return 0
      } catch (err) {
        // 仅允许显式输入新的验证码重试；业务登录或网络结果不确定时立即结束。
        if (!(err instanceof UrsLoginError) || !['verify', 'gt'].some((step) => err.message.startsWith(step))) throw err
        console.log(`${err.message}；可重新输入验证码，不会再次发送短信。`)
      }
    }
    throw new Error('验证码提交未成功；原有账号配置保持不变')
  } finally {
    terminal.close()
  }
}
