import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'
import { randomInt } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type { CaptchaPoint, JigsawAnswer, JigsawChallenge } from './urs-captcha-proof.ts'

type Pixels = { width: number; height: number; data: Uint8Array }

async function imageBytes(urls: string[]): Promise<Buffer> {
  let lastError: unknown = new Error('服务端没有返回验证码图片')
  for (const input of urls) {
    const url = new URL(input)
    if (url.protocol !== 'https:' || !['necaptcha.nosdn.127.net', 'necaptcha-nosdn.126.net'].includes(url.hostname)) {
      throw new Error(`不支持的验证码图片地址：${url.hostname}`)
    }
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
      if (!response.ok) throw new Error(`验证码图片 HTTP ${response.status}`)
      return Buffer.from(await response.arrayBuffer())
    } catch (error) { lastError = error }
  }
  throw lastError
}

function decode(bytes: Buffer): Pixels {
  return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? PNG.sync.read(bytes)
    : jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 4 })
}

function gray(image: Pixels, x: number, y: number): number {
  const offset = (y * image.width + x) * 4
  return image.data[offset]! * 0.299 + image.data[offset + 1]! * 0.587 + image.data[offset + 2]! * 0.114
}

/**
 * Uses kuroshoppingbuy's alpha-mask/template-matching approach. Normalized
 * covariance tolerates the darker cutout; only opaque interior pixels count.
 * Coordinates are derived from these images, without GeeTest's fixed -6 offset.
 */
export function locateJigsaw(background: Buffer, front: Buffer): { left: number; score: number; width: number; pieceWidth: number } {
  const bg = decode(background)
  const piece = decode(front)
  let x0 = piece.width, y0 = piece.height, x1 = -1, y1 = -1
  for (let y = 0; y < piece.height; y++) for (let x = 0; x < piece.width; x++) {
    if (piece.data[(y * piece.width + x) * 4 + 3]! > 10) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
    }
  }
  if (x1 < x0 || y1 < y0) throw new Error('滑块图片没有有效透明蒙版')
  const samples: { x: number; y: number; value: number }[] = []
  for (let y = y0 + 2; y <= y1 - 2; y++) for (let x = x0 + 2; x <= x1 - 2; x++) {
    if ([[-2, 0], [2, 0], [0, -2], [0, 2], [0, 0]].every(([dx, dy]) =>
      piece.data[((y + dy!) * piece.width + x + dx!) * 4 + 3]! > 240)) {
      samples.push({ x: x - x0, y: y - y0, value: gray(piece, x, y) })
    }
  }
  if (!samples.length) throw new Error('滑块图片没有可匹配的内部像素')
  const mean = samples.reduce((sum, item) => sum + item.value, 0) / samples.length
  let templateEnergy = 0
  for (const item of samples) { item.value -= mean; templateEnergy += item.value * item.value }
  if (templateEnergy === 0) throw new Error('滑块图片缺少可匹配纹理')
  const bgGray = new Float64Array(bg.width * bg.height)
  for (let y = 0; y < bg.height; y++) for (let x = 0; x < bg.width; x++) bgGray[y * bg.width + x] = gray(bg, x, y)
  const firstY = bg.height === piece.height ? y0 : 0
  const lastY = bg.height === piece.height ? y0 : bg.height - (y1 - y0 + 1)
  let best = { left: 0, score: -Infinity }
  for (let y = firstY; y <= lastY; y++) for (let x = x0; x <= bg.width - (x1 - x0 + 1); x++) {
    let sum = 0, sumSquared = 0, covariance = 0
    for (const item of samples) {
      const value = bgGray[(y + item.y) * bg.width + x + item.x]!
      sum += value; sumSquared += value * value; covariance += value * item.value
    }
    const energy = sumSquared - sum * sum / samples.length
    if (energy <= 0) continue
    const score = covariance / Math.sqrt(templateEnergy * energy)
    if (score > best.score) best = { left: x - x0, score }
  }
  if (!Number.isFinite(best.score)) throw new Error('没有找到滑块匹配位置')
  return { ...best, width: bg.width, pieceWidth: piece.width }
}

/** Generated protocol trace; these samples are not recorded human movements. */
function dragPoints(distance: number): CaptchaPoint[] {
  const points: CaptchaPoint[] = []
  let elapsedMs = 0
  const count = 60
  for (let index = 1; index <= count; index++) {
    elapsedMs += randomInt(12, 26)
    const progress = index / count
    const x = Math.round(distance * (1 - (1 - progress) ** 3))
    const y = Math.round(3 * Math.sin(progress * Math.PI))
    // A mousemove is emitted only when the sampled coordinates change.
    if (x > 3 && (points.at(-1)?.x !== x || points.at(-1)?.y !== y)) points.push({ x, y, elapsedMs })
  }
  return points
}

export async function solveJigsawProtocol(challenge: JigsawChallenge): Promise<JigsawAnswer> {
  const [background, front] = await Promise.all([imageBytes(challenge.background), imageBytes(challenge.front)])
  const match = locateJigsaw(background, front)
  const scale = challenge.width / match.width
  const left = Math.round(match.left * scale)
  // Official default slider is 40px. In the central region restrict() shifts
  // the piece by half of (sliderWidth - pieceWidth).
  const dragDistance = left + (match.pieceWidth * scale - 40) / 2
  const moves = dragPoints(dragDistance)
  console.log(`滑块图像匹配完成：位置=${left}px，相关度=${match.score.toFixed(3)}`)
  await delay(moves.at(-1)!.elapsedMs)
  return { left, moves, mouseDownCount: 1 }
}
