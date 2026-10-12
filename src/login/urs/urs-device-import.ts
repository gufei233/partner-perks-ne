import { readFileSync } from 'node:fs';
import { importWatchmanDevice, parseWatchmanResponse } from './urs-anticheat.ts';
import { createFingerprintEncoder } from './urs-captcha-fingerprint-crypto.ts';
import { parseProtocolJson } from '../protocol-session.ts';
import type { UrsDeviceProfile } from './urs-device.ts';

interface HarEntry {
  request: { url: string; method: string; headers: { name: string; value: string }[]; postData?: { text?: string } };
  response: { status: number; content: { text?: string; encoding?: string } };
}

function responseText(entry: HarEntry): string {
  const content = entry.response.content;
  return content.encoding === 'base64' ? Buffer.from(content.text ?? '', 'base64').toString() : content.text ?? '';
}

/** Read one successful get/check/Watchman chain; ignore SMS, login cookies and account data. */
export function importDeviceFromHar(path: string): UrsDeviceProfile {
  const entries = (JSON.parse(readFileSync(path, 'utf8')) as { log: { entries: HarEntry[] } }).log.entries;
  for (let i = entries.length - 1; i >= 0; i--) {
    const check = entries[i]!;
    const checkUrl = new URL(check.request.url);
    if (checkUrl.origin !== 'https://webzjcaptcha.reg.163.com' || checkUrl.pathname !== '/api/v3/check' || check.response.status !== 200) continue;
    const checked = parseProtocolJson(responseText(check)) as { error: number; data?: { result: boolean } };
    if (checked.error !== 0 || checked.data?.result !== true) continue;
    for (let j = i - 1; j >= 0; j--) {
      const get = entries[j]!;
      const getUrl = new URL(get.request.url);
      if (getUrl.origin !== checkUrl.origin || getUrl.pathname !== '/api/v3/get' || get.response.status !== 200) continue;
      const challenge = parseProtocolJson(responseText(get)) as { error: number; data?: { token: string; type: number } };
      if (challenge.error !== 0 || challenge.data?.type !== 5 || challenge.data.token !== checkUrl.searchParams.get('token')) continue;
      const fp = createFingerprintEncoder().decode(getUrl.searchParams.get('fp') ?? '');
      const userAgent = get.request.headers.find(header => header.name.toLowerCase() === 'user-agent')?.value;
      const language = get.request.headers.find(header => header.name.toLowerCase() === 'accept-language')?.value.split(',')[0] ?? 'zh-CN';
      const headerNames = new Set(['sec-ch-ua', 'sec-ch-ua-platform', 'sec-ch-ua-mobile', 'dnt', 'accept-language']);
      const headers = Object.fromEntries(get.request.headers
        .filter(header => headerNames.has(header.name.toLowerCase()))
        .map(header => [header.name.toLowerCase(), header.value]));
      if (!userAgent) throw new Error('HAR 缺少设备 User-Agent');
      for (let k = j - 1; k >= 0; k--) {
        const behavior = entries[k]!;
        const url = new URL(behavior.request.url);
        if (url.origin !== 'https://webzjac.reg.163.com' || url.pathname !== '/v3/b' || behavior.response.status !== 200) continue;
        const form = behavior.request.postData?.text ?? '';
        const callback = new URLSearchParams(form).get('cb') ?? '';
        const result = parseWatchmanResponse(responseText(behavior), callback);
        if (result[0] !== 200 || typeof result[2] !== 'string' || !result[2]) continue;
        // acToken binding rejects unrelated tabs/iframes even when their /b requests succeeded.
        const watchman = importWatchmanDevice(form, getUrl.searchParams.get('acToken') ?? '', result[2]);
        if (!watchman) continue;
        return {
          version: 1, userAgent, language, headers,
          devicePixelRatio: Number(getUrl.searchParams.get('dpr') ?? '1'),
          browserFeature: Number(checkUrl.searchParams.get('bf') ?? '0'),
          fingerprintHashes: fp.fp.split(',') as [string, string], watchman,
        };
      }
      throw new Error('HAR 缺少与成功验证码关联的 Watchman 设备数据');
    }
  }
  throw new Error('HAR 中没有可导入的成功智能验证会话');
}
