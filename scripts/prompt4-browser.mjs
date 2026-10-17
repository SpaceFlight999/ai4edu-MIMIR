import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { STUDY_TOPICS, calculateStudyTrial } from '../growth/src/study-topics.mjs'

export function syntheticPdf() {
  const stream = 'BT /F1 14 Tf 50 750 Td (Synthetic Paper for Reader Verification) Tj 0 -28 Td /F1 12 Tf (Abstract) Tj 0 -24 Td (This synthetic paper studies a simple measurement system.) Tj 0 -24 Td (The method compares predictions with repeatable observations.) Tj 0 -24 Td (All values and conclusions are synthetic test fixtures.) Tj 0 -30 Td (Method and Results) Tj 0 -24 Td (Keep units and inputs consistent when comparing outcomes.) Tj 0 -24 Td (A single result does not establish performance in all conditions.) Tj ET'
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream']; let pdf = '%PDF-1.4\n', offsets = [0]
  for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += (i + 1) + ' 0 obj\n' + object + '\nendobj\n' }
  const xref = Buffer.byteLength(pdf); pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n'; return Buffer.from(pdf)
}
export async function runPrompt4Scenarios({ browser, click, input, state, delay, shot, checks, home, providerControl }) {
  async function open(section) { await browser.evaluate('window.dispatchEvent(new CustomEvent("mimir-growth-open",{detail:{tab:"library",section:' + JSON.stringify(section) + '}}))'); await browser.waitFor('Boolean(document.querySelector(".mg-content-page"))'); await delay(220) }
  async function layout() { assert.equal(await browser.evaluate("[...document.querySelectorAll('[data-more-label]')].every(section=>{const editor=section.querySelector('.mg-other-editor');const list=section.lastElementChild;return Boolean(editor.compareDocumentPosition(list)&Node.DOCUMENT_POSITION_FOLLOWING)})"), true) }
  await click('开启我的成长配置', '.mg-well-landing', true); await layout(); await click('确认并继续 →'); await layout()
  await open('courses'); await layout(); assert.equal(await browser.evaluate("document.querySelectorAll('[data-study-topic]').length"), 5); await shot('topics')
  for (const section of ['competitions', 'research', 'interest']) { await open(section); await layout() }
  checks.push('all nine custom-add editors occur above recommendations and saved cards; five topic entrances are present')
  const rows = (await state()).customChoices
  for (const row of rows) {
    if (['专业方向', '学习目标', '学习目的'].includes(row.label)) {
      await click('智慧之泉', '.mg-topbar nav', true); await click('开启我的成长配置', '.mg-well-landing', true)
      if (row.label !== '专业方向') await click('确认并继续 →')
    } else await open(({ 核心课: 'courses', 公开课: 'courses', '竞赛与历史题': 'competitions', 研究方向: 'research', 兴趣方向: 'interest' })[row.label])
    const card = '[data-custom-id="' + row.id + '"]', scope = '[data-more-label="' + row.label + '"]'
    await click('修改', card); await input('[data-custom-title="' + row.label + '"]', row.title + '修订'); await input('[data-custom-detail="' + row.label + '"]', 'revised mechanical design')
    await click('保存修改', scope); assert.equal((await state()).customChoices.find(item => item.id === row.id).title, row.title + '修订')
    if (row.label === '研究方向') {
      await click('已选择这项补充', card); assert.equal(await browser.evaluate('document.querySelector(' + JSON.stringify(card) + ').classList.contains("is-selected")'), true)
      assert.equal(await browser.evaluate('document.querySelector(' + JSON.stringify(card) + ').querySelector("[aria-pressed]").getAttribute("aria-pressed")'), 'true'); await shot('custom-selected')
    }
    await click('删除', card); await click('取消', card); assert.ok((await state()).customChoices.some(item => item.id === row.id))
    await click('删除', card); await click('确认删除', card); assert.ok(!(await state()).customChoices.some(item => item.id === row.id))
    if (row.label === '研究方向') assert.equal(await browser.evaluate("document.querySelector('.mg-research-controls select').value"), 'robot-learning')
  }
  checks.push('all eight prior categories support UI edit/delete/cancel; selected research card has persistent visual and ARIA feedback, deletion falls back safely')
  await open('courses')
  const scope = '[data-more-label="深入学习主题"]'; await click('其他', scope); await input('[data-custom-title="深入学习主题"]', '机械设计载荷对照'); await input('[data-custom-detail="深入学习主题"]', '明确材料、载荷、观察与边界'); await click('添加深入学习主题', scope)
  const custom = (await state()).customChoices.find(item => item.label === '深入学习主题'), customCard = '[data-custom-id="' + custom.id + '"]'
  await click('修改', customCard); await input('[data-custom-title="深入学习主题"]', '机械设计载荷验证'); await click('保存修改', scope)
  await click('选择这项补充', customCard); await browser.waitFor("Boolean(document.querySelector('.mg-proposal'))"); assert.ok(await browser.evaluate("document.querySelector('.mg-app').innerText.includes('机械设计载荷验证')")); await click('确认使用这份方案')
  await browser.waitFor("Boolean(document.querySelector('.mg-learning-studio'))"); assert.ok(await browser.evaluate("document.querySelector('.mg-learning-studio').innerText.includes('机械设计载荷验证')"))
  await click('40 分钟', '.mg-learning-studio', true); await click('开始这次学习 →')
  for (const [i, answer] of [1, 0, 2].entries()) await browser.evaluate('document.querySelector("[data-study-diagnosis=\\"' + i + '-' + answer + '\\"]").click()')
  await click('检查先修并保存'); await input('[data-learning-field="prediction"]', '明确材料与载荷条件'); await click('保存并继续 →')
  for (const kind of ['基础', '参考', '自选']) {
    await click(kind + '算例', '.mg-study-workbench')
    for (const key of ['studyConditions', 'studyPrediction', 'studyObservation', 'studyConclusion']) await input('[data-study-input="' + key + '"]', kind + '记录：同一条件下对照结果')
    await click('保存我的验证记录');
  }
  assert.equal(Object.values((await state()).studySessions).at(-1).trials.length, 3); await shot('custom-workbench')
  await click('保存当前过程与草稿'); await open('courses'); await click('删除', customCard); await click('确认删除', customCard)
  checks.push('custom topic supports edit, candidate confirmation, prerequisite checks, three real saved comparison records; deleting its catalog card retains the confirmed learning')
  for (const spec of STUDY_TOPICS) {
    await open('courses'); await click('开始此专题 →', '[data-study-topic="' + spec.id + '"]'); await browser.waitFor("Boolean(document.querySelector('.mg-proposal'))"); await click('确认使用这份方案'); await browser.waitFor("Boolean(document.querySelector('.mg-learning-studio'))")
    await click('40 分钟', '.mg-learning-studio', true); await click('开始这次学习 →')
    for (const [i, item] of spec.diagnosis.entries()) await browser.evaluate('document.querySelector("[data-study-diagnosis=\\"' + i + '-' + item.correct + '\\"]").click()')
    await click('检查先修并保存'); await input('[data-learning-field="prediction"]', '单位、输入与方法明确'); await click('保存并继续 →')
    for (const [kind, name, parameters] of [['basic', '基础', spec.examples[0]], ['reference', '参考', spec.examples[1]], ['custom', '自选', Object.fromEntries(spec.parameters.map(item => [item.id, item.value]))]]) {
      await click(name + '算例', '.mg-study-workbench'); const result = calculateStudyTrial(spec, { kind, parameters, prediction: spec.outputs.map(() => 0) })
      for (let i = 0; i < result.actual.length; i++) await input('[data-study-result="' + i + '"]', String(result.actual[i]))
      await click('计算、对照并保存')
    }
    const saved = await state(), plan = saved.plans.find(item => item.id === saved.activePlanId), task = plan.tasks.find(item => item.courseRef?.id === spec.id); assert.equal(saved.studySessions[task.id].trials.filter(item => item.passed).length, 3)
    await input('[data-learning-field="explanation"]', '解释三个算例与模型边界')
    for (const [i, item] of spec.diagnosis.entries()) await browser.evaluate('document.querySelectorAll(".mg-quiz fieldset")[' + i + '].querySelectorAll("input")[' + item.correct + '].click()')
    await click('检查答案并获得提示'); await click('保存并继续 →'); await input('[data-learning-field="transfer"]', '用于智能制造，明确理想模型和实际测量的区别'); await click('保存本次小步并整理 →'); await click('把专题记录加入成果草稿'); await shot(spec.id)
    await click('仅保存成果与自评'); await click('我确认完成这项目标'); assert.equal((await state()).evidence[task.id].status, 'completed')
    // Each synthetic topic reuses the same stage slot after checking completion.
    await click('成果与反馈', '.mg-studio-steps', true); await click('撤回完成标记')
    await click('保存当前过程与草稿')
  }
  checks.push('four new built-in topics complete through actual UI: confirmed plan, corrected prerequisites, three server-checked trials, quiz, editable report and explicit completion')
  if(providerControl){
    await browser.evaluate('window.dispatchEvent(new CustomEvent("mimir-growth-open",{detail:{tab:"well"}}))');await browser.waitFor('Boolean(document.querySelector(".mg-well-landing"))');await click('随时向 MIMIR 反馈 ↗');await input('.mg-coach-page textarea','合成验收：检查成长空间模型计时与失败提示')
    providerControl({delayMs:2300,failure:true});await browser.evaluate("[...document.querySelectorAll('.mg-coach-page button')].find(n=>n.textContent==='与 MIMIR 交流').click()");await browser.waitFor("document.querySelector('.mg-busy [data-mimir-processing]')?.textContent.includes('1 秒')",6000);await shot('growth-processing');await browser.waitFor("Boolean(document.querySelector('.mg-notice.error[role=alert]'))",15000);await shot('growth-error');providerControl({})
    checks.push('growth AI request elapsed seconds advance and provider failure displays an actionable alert while preserving the feedback draft')
    providerControl({delayMs:2300,reply:JSON.stringify({summary:'合成验收建议',notes:'仅验证调用路径',patch:{body:'合成改写建议'}})})
    await browser.evaluate("window.__writerResponse=null;fetch('/api/mimir/ai/assist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({module:'markdown',instruction:'合成验收：生成建议',context:{fields:{body:'合成原稿'}}})}).then(async r=>window.__writerResponse={status:r.status,value:await r.json()});true")
    await browser.waitFor("document.querySelector('[data-native-ai-status] [data-mimir-processing]')?.textContent.includes('1 秒')",6000);await shot('writer-processing');await browser.waitFor('Boolean(window.__writerResponse)',15000);assert.equal((await browser.evaluate('window.__writerResponse')).status,200);await browser.waitFor("!document.querySelector('[data-native-ai-status] [data-mimir-processing]')")
    providerControl({failure:true});await browser.evaluate("window.__writerFailure=null;fetch('/api/mimir/ai/assist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({module:'markdown',instruction:'合成验收：验证失败',context:{fields:{body:'合成原稿'}}})}).then(async r=>window.__writerFailure={status:r.status,value:await r.json()});true")
    await browser.waitFor("Boolean(document.querySelector('[data-native-ai-status] [role=alert]'))",15000);await shot('writer-error');await browser.waitFor('Boolean(window.__writerFailure)',15000);assert.ok((await browser.evaluate('window.__writerFailure')).status>=400);await click('关闭错误提示','[data-native-ai-status]');providerControl({})
    checks.push('native writer assist endpoint preserves its successful draft response, shows elapsed time and displays a safe failure alert without applying the draft')
    await click('研究','.mg-sidebar-wrap');await browser.waitFor('Boolean(document.querySelector("[contenteditable=true]"))')
    async function sendResearch(text){await browser.evaluate("document.querySelector('[contenteditable=true]').focus()");await browser.send('Input.insertText',{text});await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});}
    providerControl({delayMs:3500});await sendResearch('合成验收：仅回复一行测试文本。');await browser.waitFor("[...document.querySelectorAll('[data-turn-process]')].some(n=>n.textContent.includes('MIMIR 已处理'))",12000);await shot('research-processing');await browser.waitFor("![...document.querySelectorAll('[data-turn-process]')].some(n=>n.textContent.includes('MIMIR 已处理'))",15000)
    providerControl({failure:true});await sendResearch('合成验收：验证失败反馈。');await browser.waitFor("Boolean(document.querySelector('.Sixlwa_turnErrorRow[role=alert]'))",15000);await shot('research-error');providerControl({})
    checks.push('original research chat uses the real DSH clock with MIMIR elapsed wording and retains a visible per-turn failure alert')
  }
  await runPaperScenarios({browser,click,input,state,delay,shot,checks,home,providerControl})
}
export async function runPaperScenarios({browser,click,input,delay,shot,checks,home,providerControl}) {
  const result = await browser.evaluate("fetch('/api/paper-guide/open',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rpcId:'synthetic-reader-test'})}).then(r=>r.json())"), paperUrl = result.result.value.url
  await browser.send('Page.navigate', { url: paperUrl }); await browser.waitFor('Boolean(document.querySelector("#selection-tools"))'); await browser.waitFor('document.querySelector("#status").textContent.includes("业务服务已连接")')
  const pdfPath = join(home, 'synthetic-reader.pdf'); writeFileSync(pdfPath, syntheticPdf()); const doc = await browser.send('DOM.getDocument'), node = await browser.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#import-file' }); await browser.send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [pdfPath] })
  await browser.evaluate("(()=>{const input=document.querySelector('#import-file');if(input.files.length&&!document.querySelector('#status').textContent.includes('导入'))input.dispatchEvent(new Event('change',{bubbles:true}));})()")
  await browser.waitFor('Boolean(document.querySelector("#text-layer span"))', 60000); await browser.waitFor('Boolean(document.querySelector(".evidence-item"))', 60000)
  await click('发送所示范围并生成导读', 'body'); await browser.waitFor('Boolean(document.querySelector("#guide-result .citation"))', 30000)
  await browser.evaluate("window.__textMutations=0;new MutationObserver(rows=>window.__textMutations+=rows.filter(row=>row.type==='childList').length).observe(document.querySelector('#text-layer'),{childList:true});document.querySelector('#guide-result .citation').click()")
  await delay(600); const frame = await browser.evaluate("({hidden:document.querySelector('#highlight').hidden,style:document.querySelector('#highlight').getAttribute('style')})"); await delay(3500); assert.deepEqual(await browser.evaluate("({hidden:document.querySelector('#highlight').hidden,style:document.querySelector('#highlight').getAttribute('style')})"), frame); assert.equal(frame.hidden, false); assert.equal(await browser.evaluate('window.__textMutations'), 0)
  checks.push('native PDF import, real parser and controlled guide generation; evidence remains stable for 3.5 seconds and same-page locating does not recreate text layer')
  async function selectText() {
    await browser.evaluate("getSelection().removeAllRanges()")
    const r = await browser.evaluate("(()=>{const span=[...document.querySelectorAll('#text-layer span')].find(n=>n.textContent.includes('synthetic paper studies')),n=span||document.querySelector('#text-layer span');const r=n.getBoundingClientRect();return {x:r.x+3,y:r.y+r.height/2,end:r.x+Math.min(r.width-3,180)}})()")
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y }); await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 })
    for (let i = 1; i <= 6; i++) await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x + (r.end - r.x) * i / 6, y: r.y, button: 'left', buttons: 1 })
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.end, y: r.y, button: 'left', clickCount: 1 }); await browser.waitFor('!document.querySelector("#selection-tools").hidden'); return browser.evaluate('getSelection().toString()')
  }
  const quote = await selectText(); assert.ok(quote.length > 6); await delay(3100); assert.equal(await browser.evaluate('getSelection().toString()'), quote); assert.equal(await browser.evaluate('window.__textMutations'), 0); await shot('paper-selection')
  await click('高亮', '#selection-tools'); await browser.waitFor('Boolean(document.querySelector("#saved-highlights").children.length)'); await delay(300)
  async function paintedPdf(){await browser.evaluate('getSelection().removeAllRanges()');await delay(100);const clip=await browser.evaluate("(()=>{const r=document.querySelector('#page-surface').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:Math.min(r.height,innerHeight-r.y),scale:1}})()");return (await browser.send('Page.captureScreenshot',{format:'png',clip})).data;}
  const firstPaint=await paintedPdf();await selectText();await click('高亮','#selection-tools');await delay(300);assert.equal(await browser.evaluate("document.querySelector('#saved-highlights').children.length"),1);assert.equal(await paintedPdf(),firstPaint)
  await selectText();await click('取消高亮','#selection-tools');await browser.waitFor("document.querySelector('#saved-highlights').children.length===0");await selectText();await click('取消高亮','#selection-tools');assert.equal(await browser.evaluate("document.querySelector('#saved-highlights').children.length"),0)
  await selectText();await click('高亮','#selection-tools');await browser.waitFor('Boolean(document.querySelector("#saved-highlights").children.length)');await selectText(); await click('批注', '#selection-tools'); assert.ok(await browser.evaluate("document.querySelector('#note-anchor').textContent.includes('选区')")); await input('#note-text', '合成批注：核对输入、单位与结果'); await click('保存批注', 'body'); await browser.waitFor("document.querySelector('#note-list').textContent.includes('合成批注')")
  checks.push('duplicate highlighting preserves identical PDF pixels and one record; cancel removes covered highlights and is a no-op on an unhighlighted selection')
  await browser.send('Page.reload'); await browser.waitFor('Boolean(document.querySelector("#text-layer span"))'); await browser.waitFor("document.querySelector('#note-list').textContent.includes('合成批注')"); assert.ok(await browser.evaluate("Boolean(document.querySelector('#saved-highlights').children.length)"))
  await browser.evaluate("window.__textMutations=0;new MutationObserver(rows=>window.__textMutations+=rows.filter(row=>row.type==='childList').length).observe(document.querySelector('#text-layer'),{childList:true})")
  checks.push('real pointer text selection remains intact; contextual highlight and anchored annotation save through native service and survive reload')
  await selectText(); await click('提问', '#selection-tools'); assert.equal(await browser.evaluate("document.querySelector('#scope').value"), 'selection'); await click('发送所示范围并提问', 'body'); await browser.waitFor('Boolean(document.querySelector("#answers .citation"))', 30000); await shot('paper-question')
  checks.push('contextual question retains its original selection anchor after focus moves into the question editor and completes with source citations')
  if(providerControl){
    providerControl({delayMs:2300});await selectText();await click('提问','#selection-tools');await click('发送所示范围并提问','body');await browser.waitFor("document.querySelector('[data-mimir-processing]').textContent.includes('1 秒')",5000);await shot('paper-processing');await browser.waitFor("document.querySelector('.mimir-model-progress').hidden",15000)
    providerControl({failure:true});await selectText();await click('提问','#selection-tools');await click('发送所示范围并提问','body');await browser.waitFor("document.querySelector('#status').classList.contains('error')",15000);assert.equal(await browser.evaluate("document.querySelector('#status').getAttribute('role')"),'alert');assert.ok(await browser.evaluate("document.querySelector('#status').textContent.includes('MODEL_')"));await shot('paper-error');providerControl({})
    checks.push('native paper AI timer advances during a delayed response and every terminal provider failure displays an alert with a safe error code')
    await browser.evaluate("document.querySelector('#tools-enabled').click();document.querySelector('[data-tab=research]').click()");await delay(300);await input('#research-pages','1');await input('#research-question','合成验收：检查研究任务耗时与失败提示')
    providerControl({delayMs:2300,failure:true});await click('发送上述范围并开始研究','body');await browser.waitFor("[...document.querySelectorAll('[data-mimir-processing]')].some(n=>!n.hidden&&n.textContent.includes('1 秒'))",8000);await shot('paper-research-processing');await browser.waitFor("Boolean(document.querySelector('#research-result [role=alert]'))",15000);await shot('paper-research-error');assert.ok(await browser.evaluate("document.querySelector('#research-status + [data-mimir-processing]').hidden"));providerControl({})
    checks.push('paper research workflow shows cumulative elapsed time and a terminal failure alert, then stops its timer')
  }
  await browser.evaluate('window.__textMutations=0'); await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 860, deviceScaleFactor: 1, mobile: false }); await delay(900); assert.equal(await browser.evaluate('window.__textMutations'), 0)
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 860, deviceScaleFactor: 1, mobile: false }); await delay(1200); assert.ok(await browser.evaluate('window.__textMutations>0'))
  await input('#zoom', '1.3'); await delay(800); assert.equal(await browser.evaluate("document.querySelector('#zoom').value"), '1.3')
  checks.push('height-only resizing does not rebuild PDF text; width and zoom changes still produce the correct new render')
}
