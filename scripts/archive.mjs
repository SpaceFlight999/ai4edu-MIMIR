import { openSync, closeSync, readSync, fstatSync } from 'node:fs'
import { inflateRawSync, crc32 } from 'node:zlib'

export function openArchive(path) {
  const fd = openSync(path, 'r')
  const read = (position, size) => {
    const buffer = Buffer.alloc(size)
    let offset = 0
    while (offset < size) {
      const count = readSync(fd, buffer, offset, size - offset, position + offset)
      if (!count) throw new Error('Unexpected end of archive.')
      offset += count
    }
    return buffer
  }
  const { size } = fstatSync(fd)
  const tailSize = Math.min(size, 65557), tail = read(size - tailSize, tailSize)
  let end = tail.length - 22
  while (end >= 0 && tail.readUInt32LE(end) !== 0x06054b50) end--
  if (end < 0) throw new Error('ZIP directory not found.')
  const centralSize = tail.readUInt32LE(end + 12), centralOffset = tail.readUInt32LE(end + 16)
  const central = read(centralOffset, centralSize), entries = new Map()
  for (let at = 0; at < central.length;) {
    if (central.readUInt32LE(at) !== 0x02014b50) throw new Error('Invalid ZIP directory.')
    const nameLength = central.readUInt16LE(at + 28), extraLength = central.readUInt16LE(at + 30), commentLength = central.readUInt16LE(at + 32)
    const entry = { method: central.readUInt16LE(at + 10), crc: central.readUInt32LE(at + 16), compressed: central.readUInt32LE(at + 20), size: central.readUInt32LE(at + 24), offset: central.readUInt32LE(at + 42) }
    const name = central.subarray(at + 46, at + 46 + nameLength).toString('utf8')
    if (entries.has(name)) throw new Error('Duplicate ZIP entry: ' + name)
    entries.set(name, entry)
    at += 46 + nameLength + extraLength + commentLength
  }
  const anomalies = []
  return { entries, anomalies, close: () => closeSync(fd), contents(name) {
    const entry = entries.get(name)
    if (!entry) throw new Error('Missing archive entry: ' + name)
    const local = read(entry.offset, 30)
    if (local.readUInt32LE(0) !== 0x04034b50) throw new Error('Invalid ZIP local header.')
    const payload = read(entry.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28), entry.compressed)
    // The upstream ZIP stores some empty files as method=0 with the two-byte
    // empty-deflate marker. Their logical content is independently confirmed by
    // the inventory's size=0 and SHA-256 of the empty buffer in the verifier.
    const malformedEmpty = entry.method === 0 && entry.size === 0 && entry.crc === 0 && payload.equals(Buffer.from([3, 0]))
    if (malformedEmpty) anomalies.push(name)
    const decoded = malformedEmpty ? Buffer.alloc(0) : entry.method === 8 ? inflateRawSync(payload) : entry.method === 0 ? payload : (() => { throw new Error('Unsupported ZIP method.') })()
    if (decoded.length !== entry.size || crc32(decoded) !== entry.crc) throw new Error('ZIP integrity failure: ' + name)
    return decoded
  } }
}
