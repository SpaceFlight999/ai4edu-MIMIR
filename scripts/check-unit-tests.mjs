import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import {resolve,relative,sep} from 'node:path'
const growthVersion = JSON.parse(readFileSync('growth/package.json', 'utf8')).version
const tests = readdirSync('growth/test').filter(name => name.endsWith('.test.mjs')).map(name => 'growth/test/' + name)
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests], { encoding: 'utf8', windowsHide: true })
const summary = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped'].map(name => [name, Number(result.stdout?.match(new RegExp('^# ' + name + ' (\\d+)$', 'm'))?.[1] || 0)]))
const passed = result.status === 0 && summary.tests > 0 && summary.pass === summary.tests
const reportAt=process.argv.indexOf('--report'),reportPath=reportAt<0?`artifacts/unit-tests-${growthVersion}.json`:resolve(process.argv[reportAt+1]??''),location=relative(resolve('artifacts'),resolve(reportPath))
if(!location||location==='..'||location.startsWith('..'+sep)||location.includes(':')||!reportPath.endsWith('.json'))throw new Error('Unit report must remain inside artifacts.')
writeFileSync(reportPath, JSON.stringify({ passed, at: new Date().toISOString(), growthVersion, runtime: process.version, ...summary, ...(passed ? {} : { output: result.stdout, error: result.stderr || result.error?.message }) }, null, 2),reportAt<0?{}:{flag:'wx'})
console.log(JSON.stringify({ passed, ...summary })); if (!passed) process.exitCode = 1
