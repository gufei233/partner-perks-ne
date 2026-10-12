import { createCaptchaEncoder } from '../src/login/urs/urs-captcha-crypto.ts'

// Test-only inverse of the reviewed arithmetic codec. Synthetic fixtures only.
const alphabet = 'i/x1XgU0z7k8N+lCpOnPrv6\\qu2Gj9HRcwTYZ4bfSJBhaWstAeoMIEQ5mDdVFLKy'
const sbox = [120,85,161,172,122,38,240,203,245,16,55,3,125,227,32,128,162,77,15,106,168,156,222,88,78,105,152,166,186,90,137,228,237,209,145,117,151,194,221,2,242,224,114,23,235,25,249,164,96,153,126,112,143,191,147,212,47,48,86,75,62,230,72,200,229,66,214,63,14,92,59,155,19,223,12,238,130,206,189,42,7,196,175,163,170,40,187,219,98,193,197,108,46,211,93,102,65,177,73,233,210,37,142,241,44,202,99,246,60,160,76,26,61,149,18,140,201,216,57,180,174,45,0,144,179,29,43,226,109,165,173,107,101,81,204,185,84,36,215,68,39,181,134,250,11,176,239,182,183,35,49,207,129,80,103,79,231,52,213,56,41,195,232,17,138,115,218,8,178,33,171,150,58,158,148,94,116,131,205,247,71,82,87,141,9,69,133,123,139,113,234,132,169,64,13,21,167,254,157,159,1,252,34,20,83,119,30,244,146,190,118,208,6,220,104,198,154,97,5,236,31,184,70,217,67,188,199,110,89,51,10,136,28,111,127,22,253,54,53,255,100,74,50,91,27,225,251,192,124,135,24,243,95,121,248,4]
const inverse: number[] = []
sbox.forEach((value, index) => { inverse[value] = index })
function decodeBase64(value: string): Buffer {
  const result: number[] = []
  let bits = 0, held = 0
  for (const char of value.replace(/3+$/, '')) {
    const index = alphabet.indexOf(char)
    if (index < 0) throw new Error('invalid synthetic encoding')
    held = held << 6 | index
    bits += 6
    if (bits >= 8) { bits -= 8; result.push(held >> bits & 255) }
  }
  return Buffer.from(result)
}
export function decodeSyntheticProofPosition(encoded: string, token: string): string {
  const bytes = decodeBase64(encoded)
  const key = Buffer.from('1473').map((value, index) => value ^ bytes[index]!)
  let previous: Uint8Array = key
  const output: number[] = []
  for (let offset = 4; offset < bytes.length; offset += 4) {
    const block = bytes.subarray(offset, offset + 4)
    for (let i = 0; i < 4; i++) {
      const transformed = ((inverse[inverse[block[i]!]!]! ^ previous[i]!) - previous[i]!) & 255
      const beforeKey = transformed ^ key[i]!
      output.push((((beforeKey ^ 0x67) + 40) & 255) ^ 0x38)
    }
    previous = block
  }
  const padded = Buffer.from(output)
  const length = padded.readUInt32BE(padded.length - 4)
  const message = padded.subarray(0, length).toString('utf8').slice(0, -8)
  const text = Buffer.from(decodeBase64(message).map((byte, index) => byte ^ token.charCodeAt(index % token.length))).toString()
  if (createCaptchaEncoder().xor(token, text) !== message) throw new Error('synthetic token mismatch')
  return text
}
