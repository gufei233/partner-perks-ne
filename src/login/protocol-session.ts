import { CookieJar } from 'tough-cookie'
import type { UrsDeviceProfile } from './urs/urs-device.ts'

const ALLOWED_HOSTS = new Set([
  'dl.reg.163.com',
  'webzjcaptcha.reg.163.com',
  'webzjac.reg.163.com',
  'inf.ds.163.com',
])
export const URS_REFERER = 'https://dl.reg.163.com/webzj/v1.0.1/pub/index2_new.html'
export const LOGIN_USER_AGENT = `PartnerPerksNE/1.0 Node.js/${process.versions.node} (${process.platform}; ${process.arch})`

export type ProtocolResponse = {
  status: number
  headers: Headers
  text: string
}

/** 每次短信登录使用独立 CookieJar。发送和验证短信不会自动重试。 */
export class ProtocolSession {
  readonly cookies = new CookieJar()
  readonly device: UrsDeviceProfile | undefined
  readonly userAgent: string
  private readonly saveDevice: ((profile: UrsDeviceProfile) => void) | undefined

  constructor(options: { device?: UrsDeviceProfile; saveDevice?: (profile: UrsDeviceProfile) => void } = {}) {
    this.device = options.device
    this.userAgent = options.device?.userAgent ?? LOGIN_USER_AGENT
    this.saveDevice = options.saveDevice
  }

  persistDevice(): void {
    if (this.device) this.saveDevice?.(this.device)
  }

  async request(input: string | URL, options: {
    method?: 'GET' | 'POST'
    body?: string
    headers?: Record<string, string>
    timeoutMs?: number
  } = {}): Promise<ProtocolResponse> {
    let url = new URL(input)
    let method = options.method ?? 'GET'
    let body = options.body
    const signal = AbortSignal.timeout(options.timeoutMs ?? 15000)
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) throw new Error('登录接口返回了未支持的跳转地址')
      // The official iframe uses strict-origin-when-cross-origin for CAPTCHA/Watchman calls.
      const referer = url.hostname === 'dl.reg.163.com' ? URS_REFERER : 'https://dl.reg.163.com/'
      const jsonp = method === 'GET' && (url.hostname === 'webzjcaptcha.reg.163.com' ||
        (url.hostname === 'dl.reg.163.com' && url.pathname === '/dl/getConf'))
      const headers = new Headers({ 'User-Agent': this.userAgent, Referer: referer,
        'Accept-Language': this.device?.language ?? 'zh-CN', ...this.device?.headers,
        ...(this.device ? { 'Sec-Fetch-Site': url.hostname === 'dl.reg.163.com' ? 'same-origin' : 'same-site',
          'Sec-Fetch-Dest': jsonp ? 'script' : 'empty' } : {}),
        ...options.headers })
      const cookie = await this.cookies.getCookieString(url.href)
      if (cookie) headers.set('Cookie', cookie)
      const response = await fetch(url, {
        method,
        headers,
        ...(body === undefined ? {} : { body }),
        signal,
        // Undici emits Sec-Fetch-Mode from this option, overriding a manually supplied header.
        mode: jsonp ? 'no-cors' : 'cors',
        redirect: 'manual',
      })
      for (const raw of response.headers.getSetCookie()) await this.cookies.setCookie(raw, url.href)
      const text = await response.text()
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        if (!location) throw new Error('登录接口跳转缺少 Location')
        url = new URL(location, url)
        if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
          method = 'GET'
          body = undefined
        }
        continue
      }
      return { status: response.status, headers: response.headers, text }
    }
    throw new Error('登录接口跳转次数超限')
  }

  async cookie(name: string, url: string): Promise<string | undefined> {
    return (await this.cookies.getCookies(url)).find((item) => item.key === name)?.value
  }
}

/** 仅解析 JSON / 官方 JSONP；不使用 eval 执行响应内容。 */
export function parseProtocolJson(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const jsonp = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(([\s\S]*)\)\s*;?$/.exec(trimmed)
    if (!jsonp) throw new Error('登录接口返回了无法解析的响应')
    try {
      return JSON.parse(jsonp[1] ?? '')
    } catch {
      throw new Error('登录接口返回了无法解析的 JSONP')
    }
  }
}
