import { randomBytes, randomUUID } from 'node:crypto'
import { ProtocolSession, parseProtocolJson } from './protocol-session.ts'
import { encryptUrsParams } from './urs/urs-crypto.ts'
import { calculateVdf, type UrsVdfChallenge, type UrsPowerParam } from './urs/urs-pow.ts'
import { LOGIN_URL, type AuthType } from '../api.ts'

const PRODUCT = 'godlike_web'
const PKID = 'fDydrIe'
const PKHT = 'ds.163.com'
const TOP_URL = 'https://vip.ds.163.com/partner-perks'
const USER_INFO_URL = 'https://inf.ds.163.com/v1/web/base/mine/userInfo'
const PATHS = {
  ini: '/dl/dlzc/yd/ini',
  vfscp: '/dl/dlzc/yd/vfscp',
  powGetP: '/dl/dlzc/yd/powGetP',
  send: '/dl/dlzc/yd/sms/sm',
  gt: '/dl/dlzc/yd/gt',
  verify: '/dl/dlzc/yd/sms/vfsms',
} as const

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('登录接口响应格式异常')
  return value as Record<string, unknown>
}
function rtid(): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  return Array.from(randomBytes(32), (byte) => alphabet[byte % alphabet.length]).join('')
}
export class UrsLoginError extends Error {
  readonly code: string
  constructor(step: string, code: unknown) {
    const safeCode = /^-?\d+$/.test(String(code)) ? String(code) : 'unknown'
    super(`${step}未成功（ret=${safeCode}）`)
    this.name = 'UrsLoginError'
    this.code = safeCode
  }
}
export type SmsLoginPreflight = { capFlag: number; requiresPower: boolean }
export type SmsLoginResult = { passport: string; auth: AuthType; account: string }
type CaptchaSolver = (session: ProtocolSession, capId: string) => Promise<string>
type PreparedCaptcha = { verify(): Promise<string> }
type CaptchaPreparer = (session: ProtocolSession, capId: string) => Promise<PreparedCaptcha>

/** 纯协议短信登录：每次登录独立会话，短信发送/验证只按用户操作调用一次。 */
export class UrsSmsLogin {
  readonly session: ProtocolSession
  private readonly captchaPreparer: CaptchaPreparer
  private preparedCaptcha: PreparedCaptcha | undefined
  private readonly powerSolver: (challenge: UrsVdfChallenge) => UrsPowerParam
  private phase: 'new' | 'ready' | 'preparing' | 'send-attempted' | 'sent' | 'verified' = 'new'
  private capFlag = 0
  private capId = ''
  private requiresPower = false
  private phone = ''

  constructor(options: {
    session?: ProtocolSession
    captchaSolver?: CaptchaSolver
    captchaPreparer?: CaptchaPreparer
    powerSolver?: (challenge: UrsVdfChallenge) => UrsPowerParam
  } = {}) {
    this.session = options.session ?? new ProtocolSession()
    const solver = options.captchaSolver
    this.captchaPreparer = options.captchaPreparer ?? (solver
      ? async (session, capId) => ({ verify: () => solver(session, capId) })
      : async (session, capId) => {
        const { prepareSmartCaptcha } = await import('./urs/urs-captcha.ts')
        return prepareSmartCaptcha(session, capId)
      })
    this.powerSolver = options.powerSolver ?? calculateVdf
  }

  private async call(name: keyof typeof PATHS, fields: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const payload = { pd: PRODUCT, pkid: PKID, pkht: PKHT, channel: 14, ...fields, topURL: TOP_URL, rtid: rtid() }
    const response = await this.session.request(`https://dl.reg.163.com${PATHS[name]}`, {
      method: 'POST',
      body: JSON.stringify({ encParams: encryptUrsParams(payload) }),
      headers: { 'Content-Type': 'application/json', Origin: 'https://dl.reg.163.com' },
    })
    if (response.status !== 200) throw new Error(`登录步骤 ${name} HTTP ${response.status}`)
    const value = object(parseProtocolJson(response.text))
    if (String(value.ret) !== '201') throw new UrsLoginError(name, value.ret)
    return value
  }

  async begin(): Promise<SmsLoginPreflight> {
    if (this.phase !== 'new') throw new Error('登录会话已初始化，请勿重复初始化')
    const conf = new URL('https://dl.reg.163.com/dl/getConf')
    conf.search = new URLSearchParams({ callback: `URSJSONP${Date.now()}`, pkid: PKID, pd: PRODUCT, mode: '1', probe: '1' }).toString()
    const response = await this.session.request(conf)
    if (response.status !== 200) throw new Error(`登录配置 HTTP ${response.status}`)
    const config = object(parseProtocolJson(response.text))
    if (String(config.ret) !== '201') throw new UrsLoginError('getConf', config.ret)
    const value = await this.call('ini')
    if (!Number.isInteger(value.capFlag) || typeof value.pv !== 'boolean') throw new Error('登录初始化响应缺少验证码/计算挑战配置')
    this.capFlag = value.capFlag as number
    this.capId = typeof value.capId === 'string' ? value.capId : ''
    this.requiresPower = value.pv
    this.phase = 'ready'
    return { capFlag: this.capFlag, requiresPower: this.requiresPower }
  }

  private async ensureCaptchaPrepared(): Promise<void> {
    if (this.capFlag === 0) return
    if (this.capFlag !== 6 || !this.capId) throw new Error(`尚不支持官方下发的验证方式（capFlag=${this.capFlag}）；没有发送短信`)
    if (!this.preparedCaptcha) this.preparedCaptcha = await this.captchaPreparer(this.session, this.capId)
  }

  /** 只取得挑战；调用后应立即校验，不要在挑战存续期间等待终端输入。 */
  async prepareCaptcha(): Promise<void> {
    if (this.phase !== 'ready') throw new Error('请先初始化登录；登录准备正在进行时不能重复操作')
    this.phase = 'preparing'
    try { await this.ensureCaptchaPrepared() } finally { this.phase = 'ready' }
  }

  private async preparePower(phone?: string): Promise<UrsPowerParam | undefined> {
    if (!this.requiresPower) return undefined
    const power = await this.call('powGetP', phone ? { un: phone } : {})
    const info = object(power.pVInfo)
    if (info.needCheck === false) return undefined
    if (info.needCheck !== true) throw new Error('计算挑战响应格式异常')
    return this.powerSolver(info as unknown as UrsVdfChallenge)
  }

  /** Both preflight and SMS use this exact VDF → CAPTCHA → phone-binding sequence. */
  private async verifyChallenges(phone?: string): Promise<UrsPowerParam | undefined> {
    try {
      await this.ensureCaptchaPrepared()
      const pVParam = await this.preparePower(phone)
      if (this.preparedCaptcha) {
        const cap = await this.preparedCaptcha.verify()
        if (!cap) throw new Error('智能验证码未完成；没有发送短信')
        if (phone) await this.call('vfscp', { un: phone, cap })
      }
      return pVParam
    } finally {
      this.preparedCaptcha = undefined
    }
  }

  /** 不发送短信；显式提供手机号时，连同实际登录的手机号绑定步骤一起验证。 */
  async checkCaptcha(phone?: string): Promise<void> {
    if (this.phase !== 'ready') throw new Error('请先初始化登录')
    if (phone !== undefined && !/^1[3-9]\d{9}$/.test(phone)) throw new Error('请输入中国大陆的 11 位手机号')
    this.phase = 'preparing'
    try {
      await this.verifyChallenges(phone)
    } finally {
      this.phase = 'ready'
    }
  }

  async sendSms(phone: string): Promise<void> {
    if (this.phase !== 'ready') throw new Error('请先初始化登录；同一会话不自动重复发送短信')
    if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('请输入中国大陆的 11 位手机号')
    this.phase = 'preparing'
    this.phone = phone
    try {
      const pVParam = await this.verifyChallenges(phone)
      // 请求结果不确定时也不能再次自动发送：先标记此会话已经尝试发送。
      this.phase = 'send-attempted'
      await this.call('send', { un: phone, ...(pVParam ? { pVParam } : {}) })
      this.phase = 'sent'
    } catch (err) {
      // 验证准备失败尚未触发短信请求；发送尝试之后则保留终止状态。
      if (this.phase === 'preparing') this.phase = 'ready'
      throw err
    }
  }

  async verifySms(code: string): Promise<SmsLoginResult> {
    if (this.phase !== 'sent') throw new Error('请先主动发送短信验证码')
    if (!/^\d{6}$/.test(code)) throw new Error('短信验证码应为 6 位数字')
    const ticket = await this.call('gt', { un: this.phone })
    if (typeof ticket.tk !== 'string' || !ticket.tk) throw new Error('官方接口未返回短信验证票据')
    // 官方统一登录的免登录选项：l=1、d=30 与本产品成功 HAR 一致。
    // 这是请求的会话期限，实际 Passport 有效期仍由服务端决定。
    await this.call('verify', { l: 1, d: 30, un: this.phone, sms: code, tk: ticket.tk, domains: '' })
    this.phase = 'verified'
    const passport = await this.session.cookie('NTES_YD_PASSPORT', LOGIN_URL)
    if (!passport) throw new Error('短信验证完成但没有取得适用于大神接口的 NTES_YD_PASSPORT')
    // XSRF 优先用本会话已有值；缺失时发送新随机值并以业务响应实际校验，不能假定验证成功。
    const xsrfToken = await this.session.cookie('GL-XSRF-TOKEN', LOGIN_URL) ?? randomUUID()
    await this.session.cookies.setCookie(`GL-XSRF-TOKEN=${xsrfToken}; Path=/; Secure`, LOGIN_URL)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Gl-X-Xsrf-Token': xsrfToken,
      'Gl-ClientType': '60',
      'Gl-DeviceId': randomUUID().replaceAll('-', ''),
      Origin: 'https://vip.ds.163.com',
      Referer: TOP_URL,
    }
    // HAR 对应的 base/login 是空 body POST，不加业务领取接口的 Gl-Checksum。
    const login = await this.session.request(LOGIN_URL, { method: 'POST', headers })
    const loginBody = object(parseProtocolJson(login.text))
    if (login.status !== 200 || loginBody.code !== 200) throw new UrsLoginError('大神业务登录', loginBody.code)
    const jSessionId = await this.session.cookie('JSESSIONID', LOGIN_URL)
    const glUid = await this.session.cookie('GOD_UUID', LOGIN_URL)
    if (!jSessionId || !glUid) throw new Error('大神业务登录响应缺少会话凭证；未保存账号')
    const loginIdentity = this.validateBusinessIdentity(loginBody.result, glUid)
    // base/login 可更新 Cookie，后续请求和保存的 auth 必须使用同一新值。
    const activeXsrfToken = await this.session.cookie('GL-XSRF-TOKEN', LOGIN_URL)
    if (!activeXsrfToken) throw new Error('大神业务登录后缺少 XSRF 凭证；未保存账号')
    headers['Gl-X-Xsrf-Token'] = activeXsrfToken
    headers['Gl-Uid'] = glUid
    const userInfo = await this.session.request(USER_INFO_URL, { headers })
    const userBody = object(parseProtocolJson(userInfo.text))
    if (userInfo.status !== 200 || userBody.code !== 200) throw new UrsLoginError('账号信息校验', userBody.code)
    const identity = this.validateBusinessIdentity(userBody.result, glUid)
    if (identity.account !== loginIdentity.account) {
      throw new Error('大神业务登录与账号查询返回的账号不一致；未保存账号')
    }
    return { passport, auth: { xsrfToken: activeXsrfToken, jSessionId, glUid }, account: this.phone }
  }

  private validateBusinessIdentity(value: unknown, glUid: string): { account: string } {
    const identity = object(value)
    // HAR 的 showAccount 是完整大陆手机号；不删除任意字符后再假定匹配。
    if (identity.showAccount !== this.phone) {
      throw new Error('登录返回的账号与本次输入手机号不一致；未保存账号')
    }
    const user = object(identity.user)
    if (typeof user.uid !== 'string' || !user.uid || user.uid !== glUid) {
      throw new Error('大神业务响应 UID 与会话 Cookie 不一致；未保存账号')
    }
    if (typeof identity.account !== 'string' || !identity.account) {
      throw new Error('大神业务响应缺少账号标识；未保存账号')
    }
    return { account: identity.account }
  }
}
