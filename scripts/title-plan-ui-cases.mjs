import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {GrowthStore} from '../growth/src/store.mjs'
import {defaultProfile,makeDraft,templatePlan} from '../growth/src/domain.mjs'

export function prepareTitlePlanHome(home) {
  const store=new GrowthStore(join(home,'mimir-growth/growth.sqlite'))
  try{
    store.mutate({key:randomUUID(),fingerprint:'synthetic-title-plan-layout',version:0,kind:'fixture'},state=>{
      const profile={...defaultProfile(),purpose:'找到适合自己的研究方向。'};
      state.profile=profile;state.profileSaved=true;
      makeDraft(state,{...templatePlan(profile),rationale:'根据现有基础和可投入时间分配实践与复盘；先验证一个小目标，再决定是否深入，保留来源和适用条件。'.repeat(35)},{profile,mode:'template'});
    });
  }finally{store.close()}
}
export async function verifyTitlePlanUi({browser,project,checks}) {
  await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false})
  const wait=expression=>browser.waitFor(expression,20000)
  const click=async selector=>{await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))&&!document.querySelector(${JSON.stringify(selector)}).disabled`);await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)}
  const fill=async(selector,text)=>{await browser.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(text)});n.dispatchEvent(new Event('input',{bubbles:true}))})()`)}
  const doc=()=>browser.evaluate('fetch("/api/mimir/document").then(r=>r.json()).then(r=>r.data)')
  const screenshot=async name=>writeFileSync(join(project,'artifacts/'+name),Buffer.from((await browser.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  const heading='.mimir-title-row .mimir-title-trigger',top='.mimir-topbar-location .mimir-title-trigger'
  const synced=async title=>wait(`document.querySelector(${JSON.stringify(heading)})?.textContent===${JSON.stringify(title)}&&document.querySelector(${JSON.stringify(top)})?.textContent===${JSON.stringify(title)}`)
  await click('.mimir-product-nav button[aria-label=文稿]')
  await click('.mimir-nav-document')
  const original=await doc(),first='轴承故障诊断 · 修改后的实验方案'
  await click(heading);await fill('.mimir-title-row input[aria-label=文稿标题]',first)
  await click('.mimir-title-row form button[type=submit]');await synced(first)
  let saved=await doc();assert.equal(saved.title,first);assert.deepEqual(saved.content,original.content);assert.deepEqual(saved.annotations,original.annotations)
  checks.push({name:'heading-rename-persists-and-updates-topbar-without-changing-content',passed:true})
  await click(top);await fill('.mimir-topbar-location input[aria-label=文稿标题]','取消的标题')
  await wait('document.activeElement===document.querySelector(".mimir-topbar-location input[aria-label=文稿标题]")')
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await synced(first);assert.equal((await doc()).title,first)
  checks.push({name:'title-edit-supports-escape-cancel',passed:true})
  await browser.evaluate('(()=>{const e=document.querySelector(".ProseMirror[contenteditable=true]");e.focus();const r=document.createRange();r.selectNodeContents(e);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r)})()')
  await browser.send('Input.insertText',{text:'【标题验收：保留未保存正文】'})
  const second='跨位置同步的最终文稿标题'
  await click(top);await fill('.mimir-topbar-location input[aria-label=文稿标题]',second);await click('.mimir-topbar-location button[type=submit]');await synced(second)
  saved=await doc();assert.ok(JSON.stringify(saved.content).includes('标题验收：保留未保存正文'));assert.equal(saved.title,second)
  checks.push({name:'topbar-rename-flushes-pending-body-save-and-keeps-both-titles-current',passed:true})
  const third='响应丢失后仍能重试的标题',beforeRetry=saved.version
  await browser.evaluate('window.__titleTestFetch=window.fetch;window.__titleLostResponses=0;window.fetch=async function(url,options){const response=await window.__titleTestFetch(url,options);if(String(url).includes("/api/mimir/document/rename")&&window.__titleLostResponses<2){window.__titleLostResponses++;throw new TypeError("Synthetic lost response")}return response}')
  await click(heading);await fill('.mimir-title-row input[aria-label=文稿标题]',third);await click('.mimir-title-row form button[type=submit]')
  await wait('window.__titleLostResponses===2&&Boolean(document.querySelector(".mimir-title-row form [role=alert]"))')
  assert.equal((await doc()).title,third)
  assert.equal(await browser.evaluate('document.querySelector(".ProseMirror").getAttribute("contenteditable")'),'false')
  await browser.evaluate('window.fetch=window.__titleTestFetch;delete window.__titleTestFetch')
  await click('.mimir-title-row form button[type=button]');await click(heading)
  assert.equal(await browser.evaluate('document.querySelector(".mimir-title-row input[aria-label=文稿标题]").value'),third)
  await click('.mimir-title-row form button[type=submit]');await synced(third)
  assert.equal((await doc()).version,beforeRetry+1)
  checks.push({name:'lost-responses-retry-exact-idempotency-key-without-duplicate-version',passed:true})
  const external='另一窗口保存后的标题'
  await browser.evaluate(`(async()=>{const current=await fetch('/api/mimir/document').then(r=>r.json()).then(r=>r.data);const result=await fetch('/api/mimir/document/rename',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({documentId:current.documentId,expectedVersion:current.version,title:${JSON.stringify(external)},requestId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()})}).then(r=>r.json());if(!result.ok)throw Error('Synthetic rename failed')})()`)
  await click(heading);await fill('.mimir-title-row input[aria-label=文稿标题]','过期页面的标题');await click('.mimir-title-row form button[type=submit]')
  await click('.mimir-alert button')
  await wait(`document.querySelector(${JSON.stringify(top)})?.textContent===${JSON.stringify(external)}`)
  await click('.mimir-title-row form button[type=button]');await synced(external)
  checks.push({name:'stale-title-conflict-and-reload-update-the-visible-title',passed:true})
  await browser.send('Page.reload');await click('.mimir-product-nav button[aria-label=文稿]');await click('.mimir-nav-document');await synced(external)
  assert.equal((await doc()).title,external)
  await screenshot('document-title-sync-20261017.png')
  checks.push({name:'document-title-survives-page-reopen',passed:true})
  await click('.mg-sidebar-entry');await click('.mg-resume-plan')
  await wait('Boolean(document.querySelector(".mg-plan-rationale"))')
  assert.equal(await browser.evaluate('document.querySelector(".mg-plan-rationale").open'),false)
  assert.equal(await browser.evaluate('document.querySelector(".mg-rationale-body").checkVisibility()'),false)
  assert.equal(await browser.evaluate('getComputedStyle(document.querySelector(".mg-plan-intent")).flexDirection'),'column')
  await screenshot('growth-plan-rationale-collapsed-20261017.png')
  await browser.evaluate('document.querySelector(".mg-plan-rationale summary").focus()')
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
  await wait('document.querySelector(".mg-plan-rationale").open')
  assert.equal(await browser.evaluate('document.querySelector(".mg-rationale-body").checkVisibility()'),true)
  await screenshot('growth-plan-rationale-expanded-20261017.png')
  await click('.mg-plan-rationale summary');await wait('!document.querySelector(".mg-plan-rationale").open')
  await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  assert.equal(await browser.evaluate('document.querySelector(".mg-plan-intent").getBoundingClientRect().width<=innerWidth'),true)
  await screenshot('growth-plan-rationale-mobile-20261017.png')
  checks.push({name:'long-plan-rationale-is-fully-collapsed-by-default-keyboard-operable-and-responsive',passed:true})
}
