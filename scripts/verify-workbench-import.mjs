// Reuse the existing full native/PDF/browser fixture without overwriting its
// historical evidence. Extra scenarios exercise real rejection and acceptance.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

async function runImportRegressionScenarios() {
  const review = await connectBrowser(browserPort)
  review.on(event => {
    if (event.method === 'Page.javascriptDialogOpening') void review.send('Page.handleJavaScriptDialog', { accept: true })
    if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text)
  })
  const docApi = (path = '', body) => review.evaluate(`(async()=>{const r=await fetch('/api/mimir/document'+${JSON.stringify(path)},{${body ? "method:'POST',headers:{'content-type':'application/json'},body:" + JSON.stringify(JSON.stringify(body)) : ''}});const value=await r.json();if(!value.ok)throw Error(value.error.message);return value.data})()`)
  const proposals = () => docApi('/proposals')
  const openCard = async id => {
    await review.waitFor(`Boolean(document.querySelector('[data-proposal-id="${id}"]'))`, 15000)
    await review.evaluate(`document.querySelector('[data-proposal-id="${id}"]').open=true`)
    await review.waitFor(`Boolean(document.querySelector('[data-proposal-id="${id}"] .mimir-card-actions .primary'))`)
  }
  const accept = async proposal => {
    await openCard(proposal.changeSetId)
    await review.evaluate(`document.querySelector('[data-proposal-id="${proposal.changeSetId}"] .mimir-card-actions .primary').click()`)
    await review.waitFor(`!document.querySelector('[data-proposal-id="${proposal.changeSetId}"]')`, 15000)
    assert.equal((await proposals()).find(row => row.changeSetId === proposal.changeSetId).status, 'applied')
  }
  try {
    await review.send('Page.navigate', { url: instance.url })
    await review.waitFor("Boolean(document.querySelector('.mg-wordmark-light'))")
    const old = await docApi()
    const rich = [{ type: 'paragraph', attrs: { blockId: randomUUID(), textAlign: 'center' }, content: [{ type: 'text', text: '保留这段加粗居中正文', marks: [{ type: 'bold' }] }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', attrs: { blockId: randomUUID() }, content: [{ type: 'text', text: '保留列表原文' }] }] }] }]
    // End with a formatted paragraph; a trailing list makes Tiptap insert an
    // empty plain paragraph automatically and would miss the fallback branch.
    rich.reverse()
    await docApi('/save', { documentId: old.documentId, expectedVersion: old.version, content: { type: 'doc', content: rich }, annotations: [], requestId: randomUUID(), idempotencyKey: randomUUID() })
    await review.evaluate('document.querySelector(\'.mimir-product-nav button[aria-label="文稿"]\').click()')
    await review.waitFor("Boolean(document.querySelector('.mimir-nav-document'))")
    await review.evaluate("document.querySelector('.mimir-nav-document').click()")
    await review.waitFor("Boolean(document.querySelector('#mimir-document-review'))")
    await delay(2500) // allow the existing editor's initial canonical save
    const before = await docApi()

    await click('[data-tab=research]')
    await browser.evaluate("document.querySelector('#status').textContent=''")
    await click('#research-publish')
    await browser.waitFor("document.querySelector('#status').textContent.includes('已导入到工作台')", 15000)
    const first = (await proposals()).find(row => row.baseVersion === before.version && row.status === 'proposed' && row.reason.includes('研究运行层草稿'))
    assert.ok(first)
    assert.equal(first.operations[0].kind, 'appendParagraph')
    await openCard(first.changeSetId)
    await review.evaluate(`document.querySelector('[data-proposal-id="${first.changeSetId}"] .mimir-card-actions button').click()`)
    await review.waitFor(`!document.querySelector('[data-proposal-id="${first.changeSetId}"]')`)
    assert.equal((await proposals()).find(row => row.changeSetId === first.changeSetId).status, 'rejected')
    assert.deepEqual((await docApi()).content, before.content)

    await browser.evaluate("document.querySelector('#status').textContent=''")
    await click('#research-publish')
    await browser.waitFor("document.querySelector('#status').textContent.includes('已导入到工作台')", 15000)
    const next = (await proposals()).find(row => row.baseVersion === before.version && row.status === 'proposed' && row.reason.includes('研究运行层草稿'))
    assert.ok(next)
    assert.notEqual(next.changeSetId, first.changeSetId)
    const run = (await paperApi('research-history')).find(row => row.status === 'succeeded')
    assert.equal((await paperApi('research-publish', { runId: run.runId })).changeSetId, next.changeSetId)
    await accept(next)
    const accepted = await docApi()
    assert.deepEqual(accepted.content.content.slice(0, before.content.content.length), before.content.content)
    assert.match(JSON.stringify(accepted.content.content.at(-1)), /预测与观察/)
    checks.push('Real UI: reject research proposal, re-import at the same document version, automatic review refresh, idempotent retry and accept; rich paragraphs and lists stay intact.')

    for (const [label, tab, scope, title] of [['导读', 'guide', '#guide-result', '#guide-result .result-title-link'], ['提问', 'ask', '#answers', '#answers .result-title-link'], ['证据地图', 'guide', '#argument-map', '#argument-map-titles .result-title-link'], ['复现准备清单', 'guide', '#reproduction', '#reproduction-titles .result-title-link'], ['原文证据', 'guide', '#evidence-list', null]]) {
      await click(`[data-tab=${tab}]`)
      if (title) await click(title)
      const beforeSend = await docApi()
      await browser.evaluate(`(()=>{document.querySelector('#status').textContent='';[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(n=>n.textContent.trim()==='送到工作台'&&!n.disabled).click()})()`)
      await browser.waitFor("document.querySelector('#status').textContent.includes('建议已提交')", 15000)
      const proposal = (await proposals()).find(row => row.status === 'proposed' && row.baseVersion === beforeSend.version && !row.reason.includes('研究运行层草稿'))
      assert.ok(proposal, label)
      await accept(proposal)
      const saved = await docApi()
      assert.equal(saved.version, beforeSend.version + 1)
      assert.match(JSON.stringify(saved.content), /原文引文/)
      assert.deepEqual(saved.content.content.slice(0, before.content.content.length), before.content.content)
    }
    checks.push('All five paper import entry buttons also reach a visible review card and accept into the rich manuscript with source evidence preserved.')
  } finally { await review.close() }
}

const runId = randomUUID(), prefix = 'workbench-import-' + runId
let source = readFileSync(new URL('./verify-prompt10-ui.mjs', import.meta.url), 'utf8').replaceAll('prompt10', prefix)
const anchor = '  await runAllImportScenarios();'
if (source.split(anchor).length !== 2) throw new Error('Native fixture insertion point changed')
source = source.replace(anchor, anchor + '\n  await runImportRegressionScenarios();') + '\n' + runImportRegressionScenarios.toString() + '\n'
const path = resolve('scripts/.verify-workbench-import-' + runId + '.mjs')
writeFileSync(path, source, { flag: 'wx' })
try {
  const child = spawn(process.execPath, [path], { windowsHide: true, stdio: 'inherit' })
  process.exitCode = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', code => done(code ?? 1)) })
  console.log('Evidence: artifacts/' + prefix + '-ui.json')
} finally { unlinkSync(path) }
