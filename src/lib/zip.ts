// Minimal ZIP writer (STORE method, no compression) — zero dependency.
// Enough for bundling LUT text files + README into one download.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(d: Uint8Array): number {
  let c = 0xFFFFFFFF
  for (let i = 0; i < d.length; i++) c = CRC_TABLE[(c ^ d[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

export function makeZip(files: { name: string; data: string | Uint8Array }[]): Blob {
  const enc = new TextEncoder()
  const u16 = (v: number) => [v & 255, (v >> 8) & 255]
  const u32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data
    const crc = crc32(data)
    // local file header: sig, ver, flags, method(0=store), time, date(1980-01-01)
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0),
    ])
    parts.push(local, name, data)
    // central directory entry
    central.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length),
      ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
    ]), name)
    offset += local.length + name.length + data.length
  }
  const centralSize = central.reduce((s, a) => s + a.length, 0)
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ])
  return new Blob([...parts, ...central, end] as BlobPart[], { type: 'application/zip' })
}
