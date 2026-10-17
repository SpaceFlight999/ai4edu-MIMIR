// Native browser confirmation dialogs, using the current synthetic reader only.
import assert from 'node:assert/strict'
export async function runPaperConfirmations({browser,click,input,checks}) {
  const paperId=await browser.evaluate("fetch(new URL('api/papers',location.href),{method:'POST',headers:{'Content-Type':'application/json','X-Paper-Guide':'1'},body:'{}'}).then(r=>r.json()).then(rows=>rows[0].paperId)")
  const read=`fetch(new URL('api/paper',location.href),{method:'POST',headers:{'Content-Type':'application/json','X-Paper-Guide':'1'},body:JSON.stringify({paperId:${JSON.stringify(paperId)}})}).then(r=>r.json())`
  const before=await browser.evaluate(read),note=before.annotations.find(row=>row.kind==='annotation'&&row.text.includes('合成批注'))
  assert.ok(note);assert.ok(before.conversations.length>0)
  let accept=false;const dialogs=[]
  async function waitDialog(count){const end=Date.now()+5000;while(dialogs.length<count&&Date.now()<end)await new Promise(done=>setTimeout(done,20));assert.equal(dialogs.length,count,'Expected native confirmation dialog')}
  const remove=browser.on(event=>{if(event.method==='Page.javascriptDialogOpening'){dialogs.push({type:event.params.type,accept});void browser.send('Page.handleJavaScriptDialog',{accept})}})
  const noteButton=label=>`(()=>{const card=document.getElementById(${JSON.stringify('note-'+note.id)});const button=[...card.querySelectorAll('button')].find(node=>node.textContent===${JSON.stringify(label)});button.click()})()`
  try {
    await click('批注','nav.tabs')
    await browser.evaluate(noteButton('编辑'));await input('#note-text','合成批注：已保存修改，保持单位限定');await click('保存批注','body')
    await browser.waitFor(`(${read}).then(record=>record.annotations.find(row=>row.id===${JSON.stringify(note.id)})?.text==='合成批注：已保存修改，保持单位限定')`)
    const edited=await browser.evaluate(read);assert.equal(edited.annotations.find(row=>row.id===note.id).version,note.version+1)
    await browser.evaluate(noteButton('编辑'));await input('#note-text','合成批注：不保存的草稿')
    await browser.evaluate(noteButton('彻底删除'));await waitDialog(1);await browser.waitFor(`document.querySelector('#note-list').textContent.includes('已保存修改')`)
    assert.equal(dialogs.at(-1)?.accept,false)
    assert.equal((await browser.evaluate(read)).annotations.find(row=>row.id===note.id).text,'合成批注：已保存修改，保持单位限定')
    assert.equal(await browser.evaluate("document.querySelector('#note-text').value"),'合成批注：不保存的草稿')
    accept=true;await browser.evaluate(noteButton('彻底删除'));await waitDialog(2)
    await browser.waitFor(`(${read}).then(record=>!record.annotations.some(row=>row.id===${JSON.stringify(note.id)}))`)
    await browser.waitFor("document.querySelector('#note-text').value===''&&document.querySelectorAll('#note-drafts article').length===0")
    const afterNote=await browser.evaluate(read)
    assert.equal(afterNote.annotations.filter(row=>row.kind==='highlight').length,before.annotations.filter(row=>row.kind==='highlight').length)
    assert.equal(afterNote.conversations.length,before.conversations.length)
    checks.push('annotation edit increments version; native delete cancellation preserves saved note and unsaved draft; confirmation removes both while keeping highlights and questions')
    await click('提问','nav.tabs');accept=false
    await browser.evaluate("document.querySelector('#answers .question-entry .question-delete').click()")
    await waitDialog(3)
    assert.equal(dialogs.at(-1)?.accept,false);assert.equal((await browser.evaluate(read)).conversations.length,before.conversations.length)
    accept=true;await browser.evaluate("document.querySelector('#answers .question-entry .question-delete').click()");await waitDialog(4)
    await browser.waitFor(`(${read}).then(record=>record.conversations.length===${before.conversations.length-1})`)
    await browser.send('Page.reload');await browser.waitFor('Boolean(document.querySelector("#text-layer span"))')
    const restored=await browser.evaluate(read);assert.equal(restored.conversations.length,before.conversations.length-1);assert.ok(!restored.annotations.some(row=>row.id===note.id));assert.ok(restored.guideReady)
    assert.equal(restored.annotations.filter(row=>row.kind==='highlight').length,before.annotations.filter(row=>row.kind==='highlight').length)
    assert.deepEqual(dialogs.map(row=>row.accept),[false,true,false,true]);assert.ok(dialogs.every(row=>row.type==='confirm'))
    checks.push('native question delete cancellation retains history; confirmation persists after refresh and preserves parsed guide and highlight')
  } finally {remove()}
}
