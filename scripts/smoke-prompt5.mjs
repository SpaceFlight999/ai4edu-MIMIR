// Real bundled host and isolated browser; this suite never calls an online model.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { GrowthStore } from '../growth/src/store.mjs'
import { makeDraft, confirmDraft, templatePlan } from '../growth/src/domain.mjs'
import { connectBrowser } from './cdp.mjs'

const root = resolve('.'), home = join(root, '.test-data/prompt5-' + randomUUID())
const personal = join(root, 'data/student-1/mimir-growth/growth.sqlite')
const hash = () => existsSync(personal) ? createHash('sha256').update(readFileSync(personal)).digest('hex') : null
const beforeHash = hash(), checks = [], errors = [], snapshots = []
let host, edge, browser, instance, output = ''
const delay = ms => new Promise(done => setTimeout(done, ms))
async function ready(file) { const until = Date.now() + 45000; while (Date.now() < until) { if (existsSync(file)) return; if (host?.exitCode !== null && host?.exitCode !== undefined) throw new Error('Isolated host exited'); await delay(100) } throw new Error('Startup timed out') }
async function click(text, scope = '.mg-app', contains = false) {
  assert.equal(await browser.evaluate(`(() => {const el=[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(el=>${contains ? 'el.textContent.includes(' + JSON.stringify(text) + ')' : 'el.textContent.trim()===' + JSON.stringify(text)});if(!el||el.disabled)return false;el.click();return true})()`), true, 'Missing button: ' + text)
  await delay(300)
}
async function toggle(id) { await browser.evaluate(`document.querySelector('[data-learning-section="${id}"] > h2 > button, [data-learning-section="${id}"] > h3 > button, [data-learning-section="${id}"] > h4 > button').click()`); await delay(350) }
const state = () => browser.evaluate("fetch('/api/mimir/growth/state').then(r=>r.json()).then(r=>r.data)")
async function shot(name) { const image = await browser.send('Page.captureScreenshot', { format: 'png' }); const path = 'artifacts/prompt5-' + name + '.png'; writeFileSync(path, Buffer.from(image.data, 'base64')); snapshots.push(path) }
async function start() {
  host = spawn(process.execPath, ['runtime/system/app/app.mjs', '--headless', '--data-home', home], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const stream of [host.stdout, host.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-8000) })
  await ready(join(home, 'instance.json')); instance = JSON.parse(readFileSync(join(home, 'instance.json')))
}
async function stop() {
  if (instance) await fetch('http://127.0.0.1:' + instance.controlPort + '/exit', { method: 'POST', headers: { 'X-Mimir-Control': instance.controlToken }, signal: AbortSignal.timeout(3000) }).catch(() => {})
  const until = Date.now() + 10000; while (host?.exitCode === null && Date.now() < until) await delay(100)
  if (host?.exitCode === null) host.kill(); instance = null
}
try {
  const store = new GrowthStore(join(home, 'mimir-growth/growth.sqlite'))
  let oldPlan
  store.mutate({ key: randomUUID(), fingerprint: 'synthetic-old-plan', version: 0, kind: 'test-fixture' }, state => { oldPlan = makeDraft(state, templatePlan(state.profile)); confirmDraft(state, oldPlan.id, '2026-10-05T01:00:00.000Z'); state.evidence[oldPlan.tasks[0].id] = { artifactText: '旧阶段合成成果', status: 'submitted' } })
  store.close()
  await start()
  const browserHome = join(home, 'browser'); mkdirSync(browserHome, { recursive: true })
  edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--no-first-run', '--user-data-dir=' + browserHome, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  await ready(join(browserHome, 'DevToolsActivePort'))
  browser = await connectBrowser(Number(readFileSync(join(browserHome, 'DevToolsActivePort'), 'utf8').split('\n')[0]))
  browser.on(event => { if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text) })
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await browser.send('Page.navigate', { url: instance.url }); await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  assert.equal(await browser.evaluate("document.querySelector('.mimir-sidebar-v3').firstElementChild.className"), 'mimir-workspace-brand')
  assert.equal(await browser.evaluate("document.querySelectorAll('.mg-sidebar-shortcuts,#mimir-project-directory,.mimir-product-new').length"), 0)
  assert.equal(await browser.evaluate("document.querySelectorAll('.mg-topbar nav button').length"), 5)
  assert.equal(await browser.evaluate("Boolean(document.querySelector('.mg-well-emblem'))"), true)
  await shot('home'); checks.push('brand first, SVG well entry second, five core functions, no research directory or legacy sidebar shortcuts on startup')
  await click('研究', '.mimir-product-nav'); await browser.waitFor("Boolean(document.querySelector('#mimir-project-directory'))")
  await shot('research'); await click('智慧之泉', '.mimir-sidebar-v3', true); await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  assert.equal(await browser.evaluate("Boolean(document.querySelector('#mimir-project-directory'))"), false)
  await browser.evaluate("document.querySelector('.mimir-workspace-brand').click()"); await delay(350)
  await browser.waitFor("Boolean(document.querySelector('#mimir-project-directory'))")
  await click('智慧之泉', '.mimir-sidebar-v3', true)
  checks.push('research and brand enter the research workspace; returning to growth hides its project directory')
  await click('论文', '.mimir-product-nav'); await browser.waitFor("Boolean(document.querySelector('.mimir-reading-panel iframe'))")
  await click('智慧之泉', '.mimir-sidebar-v3', true)
  await click('文稿', '.mimir-product-nav'); await browser.waitFor("Boolean(document.querySelector('.mimir-dsh-panel'))")
  await click('智慧之泉', '.mimir-sidebar-v3', true)
  checks.push('paper and writer plugin buttons still open their actual native spaces')
  await click('知识与实践', '.mg-topbar nav', true); await browser.waitFor("Boolean(document.querySelector('[data-learning-section=study-topics]'))")
  assert.equal(await browser.evaluate("document.querySelector('[data-learning-section=study-topics] > h2 button').getAttribute('aria-expanded')"), 'false')
  assert.equal(await browser.evaluate("document.querySelector('#mg-section-study-topics').inert"), true)
  assert.equal(await browser.evaluate("document.querySelector('[data-more-label=公开课] .mg-core-course-links').children.length"), 2)
  await shot('library-collapsed')
  // Exercise the actual Enter key on the parent heading.
  await browser.send('Page.bringToFront')
  await browser.evaluate("document.querySelector('[data-learning-section=study-topics] > h2 button').focus()")
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' })
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await delay(350)
  assert.equal(await browser.evaluate("document.querySelector('#mg-section-study-topics').inert"), false)
  await toggle('core-route')
  assert.equal(await browser.evaluate("document.querySelector('[data-learning-section=study-topics] > h2 button').getAttribute('aria-expanded')"), 'true')
  await shot('library-expanded')
  await toggle('study-topics')
  assert.equal(await browser.evaluate("document.querySelector('[data-learning-section=core-route] > h2 button').getAttribute('aria-expanded')"), 'true')
  await toggle('study-topics')
  await click('查看全部公开课', '[data-learning-section=open-courses]', true)
  const count = (await browser.evaluate("fetch('/api/mimir/growth/library').then(r=>r.json()).then(r=>r.data.courses.length)"))
  assert.equal(await browser.evaluate("document.querySelector('[data-more-label=公开课] .mg-core-course-links').children.length"), count)
  await click('收起更多公开课', '[data-learning-section=open-courses]')
  assert.equal(await browser.evaluate("document.querySelector('[data-more-label=公开课] .mg-core-course-links').children.length"), 2)
  checks.push('independent parent sections, Enter keyboard expansion, inert collapsed content, two-course preview and full catalog expansion')
  const coreId = await browser.evaluate("document.querySelector('[data-core-detail]').dataset.coreDetail")
  await toggle('core-practice-' + coreId)
  const fonts = await browser.evaluate("[getComputedStyle(document.querySelector('.mg-core-practice ol>li>strong')).fontSize,getComputedStyle(document.querySelector('.mg-core-practice ol ul>li')).fontSize]")
  assert.deepEqual(fonts, ['16px', '15px'])
  await browser.evaluate("document.querySelector('.mg-core-practice').scrollIntoView({block:'center'})"); await shot('practice')
  await click('进入推荐练习 →', '.mg-core-practice'); await browser.waitFor("Boolean(document.querySelector('.mg-proposal'))")
  await click('确认使用这份方案'); await browser.waitFor("Boolean(document.querySelector('.mg-learning-studio'))")
  const courseState = await state()
  assert.equal(courseState.plans.find(plan => plan.id === courseState.activePlanId)?.startsAt, '2026-10-05T01:00:00.000Z')
  checks.push('readable 16px exercise questions and 15px options; course candidate confirmation opens the real learning studio and keeps current stage dates')
  await click('智慧之泉', '.mg-topbar nav', true)
  // A course continuation may occupy the large resume button; use its configuration link.
  await browser.evaluate("(() => {const buttons=[...document.querySelectorAll('.mg-well-landing button')];const target=buttons.find(el=>el.textContent.includes('重新构建我的成长')) || buttons.find(el=>el.textContent.includes('调整成长配置'));if(!target)throw new Error('No configuration entry');target.click()})()")
  await browser.waitFor("Boolean(document.querySelector('.mg-wizard'))")
  for (let i=0;i<5;i++) await click('确认并继续 →')
  await click('先体验本地示例', '.mg-option-grid', true)
  await click('确认配置并生成方案 →'); await browser.waitFor("Boolean(document.querySelector('.mg-proposal'))")
  const ranks = await browser.evaluate("[...document.querySelectorAll('[data-change-kind]')].map(el=>({replace:0,new:1,continue:2,defer:3})[el.dataset.changeKind])")
  assert.ok(ranks.every((rank,index)=>index===0||rank>=ranks[index-1]))
  await toggle('plan-changes'); assert.equal(await browser.evaluate("document.querySelector('#mg-section-plan-changes').inert"), true)
  assert.equal(await browser.evaluate("Boolean(document.querySelector('.mg-proposal-controls button'))"), true)
  await toggle('plan-changes'); assert.equal(await browser.evaluate("document.querySelector('#mg-section-plan-changes').inert"), false)
  const positions = await browser.evaluate("[...document.querySelectorAll('.mg-plan-changes article')].slice(0,2).map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y}})")
  assert.ok(positions[1].x > positions[0].x); assert.ok(Math.abs(positions[0].y-positions[1].y)<1)
  await browser.evaluate("document.querySelector('.mg-plan-change-section').scrollIntoView({block:'start'});window.scrollTo(0,0)"); await shot('plan-changes')
  const beforeConfirm = Date.now(); await click('确认使用这份方案'); await browser.waitFor("Boolean(document.querySelector('.mg-yggdrasil-board'))")
  const updated = await state(), active = updated.plans.find(plan => plan.id === updated.activePlanId)
  assert.ok(Date.parse(active.startsAt) >= beforeConfirm)
  assert.equal(active.startsAt, active.confirmedAt)
  assert.equal(updated.plans.find(plan => plan.id === oldPlan.id).startsAt, '2026-10-05T01:00:00.000Z')
  assert.equal(updated.evidence[oldPlan.tasks[0].id].artifactText, '旧阶段合成成果')
  await shot('world-tree'); checks.push('plan differences collapse independently, prioritize important changes and use both columns; full reconfiguration resets dates at actual confirmation and retains old plan/evidence')
  await click('知识与实践', '.mg-topbar nav', true); await browser.waitFor("Boolean(document.querySelector('[data-learning-section=study-topics]'))")
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 780, height: 1000, deviceScaleFactor: 1, mobile: false }); await delay(350)
  assert.equal(await browser.evaluate("document.querySelector('.mg-app').scrollWidth <= document.querySelector('.mg-app').clientWidth+1"), true)
  await shot('narrow')
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  assert.equal(await browser.evaluate("getComputedStyle(document.querySelector('.mg-disclosure-content')).transitionDuration"), '0s')
  checks.push('780px layout has no growth horizontal overflow and respects reduced motion')
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await browser.evaluate("document.querySelector('.mimir-product-rail-end button[aria-label=设置]').click()"); await delay(250)
  await click('外观', '.mimir-settings-layout nav'); await click('深色', '.mimir-preferences')
  await browser.evaluate('document.querySelector(".mimir-settings-header button[aria-label=关闭设置]").click()')
  await browser.waitFor("!document.querySelector('.mimir-settings-dialog')")
  await delay(200); assert.equal(await browser.evaluate('document.body.dataset.mimirMode'), 'dark'); await shot('dark')
  checks.push('dark appearance renders the new shell and learning hierarchy')
  const prior = await state(); await stop(); await start(); await browser.send('Page.navigate', { url: instance.url }); await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  const restored = await state(); assert.equal(restored.activePlanId, prior.activePlanId)
  assert.equal(restored.plans.find(plan => plan.id === restored.activePlanId).startsAt, active.startsAt)
  assert.equal(await browser.evaluate("Boolean(document.querySelector('#mimir-project-directory'))"), false)
  checks.push('restart restores confirmed dates and defaults to growth without research project content')
  assert.equal(hash(), beforeHash); assert.deepEqual(errors, [])
  writeFileSync('artifacts/prompt5-smoke.json', JSON.stringify({ passed:true, at:new Date().toISOString(), checks, snapshots, browserExceptions:errors, paidModelCalls:0, personalDatabaseUnchanged:true },null,2))
  console.log('Prompt5 passed: '+checks.length+' native/browser scenarios.')
} catch(error) {
  await shot('failure').catch(()=>{})
  if(browser) console.log(await browser.evaluate('document.body.innerText.slice(-1800)').catch(()=>''))
  const redact = value => String(value).replace(/\?token=[^\s"']+/g, '?token=[redacted]')
  writeFileSync('artifacts/prompt5-smoke.json',JSON.stringify({passed:false,checks,errors,error:redact(error.stack),startupDiagnostic:redact(output)},null,2))
  console.error(redact(error.stack));process.exitCode=1
} finally {
  await stop(); if(browser) { await browser.send('Browser.close').catch(()=>{}); await browser.close().catch(()=>{}) } if(edge?.exitCode===null)edge.kill()
}
