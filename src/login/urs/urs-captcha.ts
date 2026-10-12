import { UrsAnticheatSession, parseWatchmanResponse } from './urs-anticheat.ts'
import { ProtocolSession, parseProtocolJson, URS_REFERER } from '../protocol-session.ts'
import { createCaptchaCb, createCaptchaJsonpCallback, prepareSmartCaptcha as prepareFreshChallenge, type PreparedSmartCaptcha, type SmartCaptchaRetryPolicy, type JigsawSolver } from './urs-captcha-proof.ts'
import { createCaptchaFingerprint, createNativeCaptchaFingerprint } from './urs-captcha-fingerprint.ts'
import { detectNativeCaptchaBrowserFeature } from './urs-captcha-native-features.ts'

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('验证码配置结构异常')
  return value as Record<string, unknown>
}

export type CaptchaObservation = {
  stage: 'config' | 'device' | 'behavior' | 'challenge' | 'check'
  accepted: boolean
  challengeType?: number
  /** 1-based check submission number; a retry re-issues a fresh challenge. */
  attempt?: number
}

/** 复用设备档案，重新生成请求状态和指纹，并获取本次服务端挑战。 */
export async function prepareSmartCaptcha(
  session: ProtocolSession,
  captchaId: string,
  options: { report?: (event: CaptchaObservation) => void; retry?: Partial<SmartCaptchaRetryPolicy>; solveJigsaw?: JigsawSolver } = {},
): Promise<PreparedSmartCaptcha> {
  const configUrl = new URL('https://webzjcaptcha.reg.163.com/api/v2/getconf')
  configUrl.search = new URLSearchParams({
    referer: URS_REFERER, zoneId: '', id: captchaId, ipv6: 'false', runEnv: '10',
    iv: '5', loadVersion: '2.5.4', lang: 'zh-CN', cb: createCaptchaCb(), callback: createCaptchaJsonpCallback(),
  }).toString()
  const response = await session.request(configUrl)
  if (response.status !== 200) throw new Error(`验证码配置 HTTP ${response.status}`)
  const body = record(parseProtocolJson(response.text))
  if (body.error !== 0) throw new Error('验证码配置接口未确认成功')
  const config = record(body.data)
  if (typeof config.zoneId !== 'string') throw new Error('验证码配置缺少 zoneId')
  // 官方 loader：ENABLE=1、DISABLE=2；ir.enable=1 时优先选择 Guardian。
  // 本客户端尚未实现该协议，不能忽略启用标记后继续当成 Watchman。
  const ir = config.ir === undefined ? {} : record(config.ir)
  if (ir.enable === 1) throw new Error('官方已启用 IR 风险验证，当前纯协议客户端尚未实现该分支；本次登录停止')
  const anticheat = config.ac === undefined ? {} : record(config.ac)
  const preparedAt = Date.now()
  const anticheatEnabled = anticheat.enable === 1
  options.report?.({ stage: 'config', accepted: true })
  let acToken = ''
  let refreshAnticheat = async () => ''
  if (anticheatEnabled) {
    if (typeof anticheat.pn !== 'string' || typeof anticheat.bid !== 'string') throw new Error('反作弊配置缺少产品参数')
    const businessKey = anticheat.bid
    const watchman = new UrsAnticheatSession({ productNumber: anticheat.pn, userAgent: session.userAgent,
      language: session.device?.language ?? 'zh-CN', ...(session.device ? { device: session.device.watchman } : {}) })
    let deviceReady = watchman.deviceReady
    for (let i = 0; !deviceReady && i < 2; i++) {
      const form = watchman.buildDeviceForm()
      const result = await session.request(`https://webzjac.reg.163.com${form.path}`, {
        method: 'POST', body: form.body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://dl.reg.163.com' },
      })
      if (result.status !== 200) throw new Error(`反作弊设备初始化 HTTP ${result.status}`)
      const code = watchman.acceptDeviceResponse(parseWatchmanResponse(result.text, form.callback))
      if (code === 200) { deviceReady = true; break }
    }
    if (!deviceReady) throw new Error('反作弊设备初始化时钟校准未完成')
    options.report?.({ stage: 'device', accepted: true })
    refreshAnticheat = async () => {
      let behaviorReady = false
      for (let i = 0; i < 2; i++) {
        const form = watchman.buildBehaviorForm(businessKey)
        const result = await session.request(`https://webzjac.reg.163.com${form.path}`, {
          method: 'POST', body: form.body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://dl.reg.163.com' },
        })
        if (result.status !== 200) throw new Error(`反作弊会话校验 HTTP ${result.status}`)
        const code = watchman.acceptBehaviorResponse(parseWatchmanResponse(result.text, form.callback))
        session.persistDevice()
        if (code === 200) { behaviorReady = true; break }
        // Official 420 means correct the clock and submit once more, not CAPTCHA rejection.
      }
      if (!behaviorReady) throw new Error('反作弊会话时钟校准未完成')
      options.report?.({ stage: 'behavior', accepted: true })
      return watchman.getToken()
    }
    acToken = await refreshAnticheat()
  }
  const fingerprint = session.device
    ? createCaptchaFingerprint({ host: 'dl.reg.163.com', collector: { available: true, hashes: session.device.fingerprintHashes } })
    : createNativeCaptchaFingerprint('dl.reg.163.com')
  // Re-encode stable device hashes with a fresh nonce, salt and expiry; never reuse HAR fp/validate.
  return prepareFreshChallenge(session, captchaId, {
    zoneId: config.zoneId,
    referer: URS_REFERER,
    preparedAt,
    refreshAnticheat,
    ...(options.report ? { report: options.report } : {}),
    ...(options.retry ? { retry: options.retry } : {}),
    solveJigsaw: options.solveJigsaw ?? (async challenge => {
      const { solveJigsawProtocol } = await import('./urs-captcha-jigsaw.ts')
      return solveJigsawProtocol(challenge)
    }),
    runtime: {
      fingerprint: fingerprint.fingerprint,
      acToken,
      anticheatEnabled,
      devicePixelRatio: session.device?.devicePixelRatio ?? 1,
      deviceType: 1,
      browserFeature: session.device?.browserFeature ?? detectNativeCaptchaBrowserFeature(),
    },
  })
}

export async function solveSmartCaptcha(
  session: ProtocolSession,
  captchaId: string,
  options: { report?: (event: CaptchaObservation) => void; retry?: Partial<SmartCaptchaRetryPolicy> } = {},
): Promise<string> {
  const challenge = await prepareSmartCaptcha(session, captchaId, options)
  return challenge.verify()
}
