import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { win32 } from 'node:path'

function resolver(files) {
  const source = readFileSync('growth/overrides/host/index.js', 'utf8')
  const start = source.indexOf('function windowsBashExecutable('), end = source.indexOf('var ExecutionError', start)
  return vm.runInNewContext(source.slice(start, end) + '\nwindowsBashExecutable', {
    join5: win32.join, resolve: win32.resolve,
    localBinaryStat: path => { if (!files.has(path)) throw Object.assign(new Error('Missing fixture binary.'), { code: 'ENOENT' }); return { isFile: () => files.get(path) === 'file' } }
  })
}
test('Windows Bash resolves an explicit PATH binary before a Git fallback', () => {
  const find = resolver(new Map([['D:\\Shell\\bash.exe', 'file'], ['C:\\Program Files\\Git\\bin\\bash.exe', 'file']]))
  assert.equal(find({ PATH: '"D:\\Shell";C:\\Program Files\\Git\\cmd', ProgramFiles: 'C:\\Program Files' }), 'D:\\Shell\\bash.exe')
})
test('Windows Bash detects Git bin when only Git cmd is on PATH', () => {
  const find = resolver(new Map([['E:\\Tools\\Git\\bin\\bash.exe', 'file']]))
  assert.equal(find({ PATH: 'E:\\Tools\\Git\\cmd' }), 'E:\\Tools\\Git\\bin\\bash.exe')
})
test('Windows Bash detects existing standard and per-user Git installations', () => {
  assert.equal(resolver(new Map([['C:\\Program Files\\Git\\bin\\bash.exe', 'file']]))({ PATH: '', ProgramFiles: 'C:\\Program Files' }), 'C:\\Program Files\\Git\\bin\\bash.exe')
  assert.equal(resolver(new Map([['D:\\Local\\Programs\\Git\\bin\\bash.exe', 'file']]))({ PATH: '', LOCALAPPDATA: 'D:\\Local' }), 'D:\\Local\\Programs\\Git\\bin\\bash.exe')
})
test('Windows Bash rejects absent binaries and directories with a useful local error', () => {
  assert.throws(() => resolver(new Map([['D:\\Shell\\bash.exe', 'directory']]))({ PATH: 'D:\\Shell' }), /Bash 运行环境未就绪/)
})
