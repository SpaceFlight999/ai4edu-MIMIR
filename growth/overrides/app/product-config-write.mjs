// Reproducible source transform for generated Windows startup configuration.
import { writeFileSync } from 'node:fs';

export function writeProductConfig(file, content, { platform = process.platform, write = writeFileSync, wait = milliseconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds) } = {}) {
  const delays = [20, 40, 80, 160, 200, 200, 200, 200];
  for (let attempt = 0; ; attempt++) {
    try { return write(file, content); }
    catch (error) {
      if (platform !== 'win32' || !['EBUSY', 'EPERM'].includes(error.code) || attempt >= delays.length) throw error;
      wait(delays[attempt]);
    }
  }
}

export function applyProductConfigWrite(source) {
  const helper = 'export ' + writeProductConfig.toString();
  const anchor = 'export function productPaths(';
  if (!source.includes(helper)) {
    if (source.includes('function writeProductConfig(') || source.split(anchor).length !== 2) throw new Error('Unexpected generated-config startup baseline.');
    source = source.replace(anchor, helper + '\n\n' + anchor);
  }
  const configureAt = source.indexOf('export function configureProduct(');
  if (configureAt < 0) throw new Error('Generated-config startup function is missing.');
  const startup = source.slice(configureAt), originalCalls = [...startup.matchAll(/\bwriteFileSync\(/g)].length;
  const existingCalls = [...startup.matchAll(/\bwriteProductConfig\(/g)].length;
  if (originalCalls === 5 && existingCalls === 0) return source.slice(0, configureAt) + startup.replaceAll(/\bwriteFileSync\(/g, 'writeProductConfig(');
  if (originalCalls === 0 && existingCalls === 5) return source;
  throw new Error('Unexpected generated-config write sites; do not patch blindly.');
}
