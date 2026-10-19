#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { main } from '../lib/installer.mjs'

const release = JSON.parse(await readFile(new URL('../release.json', import.meta.url), 'utf8'))
try {
  const options = process.argv.slice(2)
  if (options.includes('--help') || options.includes('-h')) {
    console.log('MIMIR ' + release.version + ' (Windows x64, Node.js >=24)\nUsage: npx.cmd @spaceflight99/mimir@' + release.version + ' [--install-only]\nInstalls the runtime and creates a desktop shortcut. Later runs reuse the local installation.')
  } else if (options.includes('--version')) {
    console.log(release.version)
  } else {
    if (options.some(option => option !== '--install-only')) throw new Error('Unknown option. Run with --help.')
    await main(release, { installOnly: options.includes('--install-only') })
  }
} catch (error) {
  console.error('MIMIR: ' + error.message)
  process.exitCode = 1
}
