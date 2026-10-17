import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { connectBrowser, browserPort } from './cdp.mjs'
const browser = await connectBrowser(browserPort())
const instance = JSON.parse(readFileSync('.test-data/integration/instance.json'))
const selectors = { courses: '.mg-library-graph-scroll', competitions: '.mg-competition-catalog', research: '.mg-research-controls', interest: '.mg-interest-explorer' }
async function click(selector) { assert.equal(await browser.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.click();return true})()`), true); }
async function shot(name) { const value = await browser.send('Page.captureScreenshot', { format: 'png' }); writeFileSync('artifacts/' + name + '.png', Buffer.from(value.data, 'base64')); }
try {
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await browser.send('Page.navigate', { url: instance.url })
  await browser.waitFor("Boolean(document.querySelector('.mg-learning-doors'))")
  assert.equal(await browser.evaluate("document.querySelector('.mg-wordmark').textContent.includes('v0.4.0')"), true)
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-learning-door]').length"), 4)
  await shot('learning-home-entrances')
  for (const [id, selector] of Object.entries(selectors)) {
    await click('[aria-label="打开智慧之泉培养方案"]'); await browser.waitFor("Boolean(document.querySelector('.mg-learning-doors'))")
    await click('[data-learning-door="' + id + '"]'); await browser.waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
  }
  // Sidebar navigation must also change sections when the library is already open.
  for (const [id, selector] of Object.entries(selectors)) {
    await click('[data-sidebar-door="' + id + '"]'); await browser.waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
  }
  await shot('learning-interest-entrance')
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
  await click('[aria-label="打开智慧之泉培养方案"]'); await browser.waitFor("Boolean(document.querySelector('.mg-learning-doors'))")
  await shot('learning-home-narrow')
  assert.equal(await browser.evaluate("document.querySelector('.mg-app').scrollWidth<=document.querySelector('.mg-app').clientWidth+1"), true)
  assert.equal(await browser.evaluate("[...document.querySelectorAll('[data-learning-door]')].every(el=>el.getBoundingClientRect().bottom<=innerHeight)"), true)
  writeFileSync('artifacts/entrance-smoke.json', JSON.stringify({ passed: true, homeEntries: 4, sidebarEntries: 4, version: '0.4.0', narrowFirstScreen: true }, null, 2))
  console.log('Entrance smoke passed: homepage, repeated sidebar navigation, visible version and narrow first screen.')
} finally { await browser.close() }
