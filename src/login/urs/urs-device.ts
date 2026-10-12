import { existsSync, readFileSync } from 'node:fs';
import { writePrivateJson } from '../../storage/auth-store.ts';

export type WatchmanFields = Record<string, string | number | boolean | number[]>;
export interface WatchmanDeviceState {
  productNumber: string;
  deviceId: string;
  transportId: string;
  environment: WatchmanFields;
  page: WatchmanFields;
}

/** Browser device cache imported once; never stores an account cookie or CAPTCHA proof. */
export interface UrsDeviceProfile {
  version: 1;
  userAgent: string;
  language: string;
  /** Static HTTP device headers; excludes cookies, tokens and per-request metadata. */
  headers?: Record<string, string>;
  devicePixelRatio: number;
  browserFeature: number;
  fingerprintHashes: [string, string];
  watchman: WatchmanDeviceState;
}

export function readDeviceProfile(path: string): UrsDeviceProfile | undefined {
  if (!existsSync(path)) return undefined;
  const value = JSON.parse(readFileSync(path, 'utf8')) as UrsDeviceProfile;
  if (value.version !== 1 || !value.userAgent || value.fingerprintHashes?.length !== 2 ||
      !value.watchman?.deviceId || !value.watchman.transportId || !value.watchman.environment || !value.watchman.page) {
    throw new Error('登录设备档案无效，请重新使用 login --import-device 导入');
  }
  return value;
}

export function saveDeviceProfile(path: string, profile: UrsDeviceProfile): void {
  writePrivateJson(path, profile);
}
