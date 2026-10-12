/** Offline decoding of the SDK's salted 64-byte packets, used only for device import. */
export function decodeUrsPacket(value: string, format: {
  alphabet: string; padding: string; key: string; substitution: readonly number[];
  undo(value: number, index: number): number;
}): Buffer {
  const raw: number[] = [];
  let held = 0, bits = 0;
  for (const char of value) {
    if (char === format.padding) break;
    const digit = format.alphabet.indexOf(char);
    if (digit < 0) throw new Error('HAR 设备数据编码无效');
    held = held << 6 | digit;
    bits += 6;
    if (bits >= 8) { bits -= 8; raw.push(held >> bits & 255); }
  }
  const bytes = Buffer.from(raw);
  if (bytes.length < 68 || (bytes.length - 4) % 64) throw new Error('HAR 设备数据长度无效');
  const inverse: number[] = [];
  format.substitution.forEach((value, index) => { inverse[value & 255] = index; });
  const secret = Buffer.from(format.key);
  const key = Buffer.from(Array.from({ length: 64 }, (_, i) => secret[i % secret.length]! ^ bytes[i % 4]!));
  let previous: Uint8Array = key;
  const output: number[] = [];
  for (let offset = 4; offset < bytes.length; offset += 64) {
    const block = bytes.subarray(offset, offset + 64);
    for (let i = 0; i < 64; i++) {
      const transformed = (((inverse[inverse[block[i]!]!]! ^ previous[i]!) - previous[i]!) & 255) ^ key[i]!;
      output.push(format.undo(transformed, i) & 255);
    }
    previous = block;
  }
  const padded = Buffer.from(output);
  const length = padded.readUInt32BE(padded.length - 4);
  if (length < 8 || length > padded.length - 4) throw new Error('HAR 设备明文长度无效');
  const payload = padded.subarray(0, length - 8);
  let crc = 0xffffffff;
  for (const byte of payload) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  if (((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0') !== padded.subarray(length - 8, length).toString()) {
    throw new Error('HAR 设备数据校验失败');
  }
  return payload;
}
