import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
const modulePath = resolve('runtime/system/engine/node_modules/@mimir/dsh-workbench-bundle/host/.title-test-'+randomUUID()+'.mjs')
writeFileSync(modulePath,readFileSync('growth/overrides/host/index.js','utf8')+'\nexport { DocumentService };\n')
let DocumentService
try { ({DocumentService}=await import(pathToFileURL(modulePath).href)) } finally {unlinkSync(modulePath)}
function fixture() {
  const service=new DocumentService({databasePath:':memory:'}),context={projectId:randomUUID(),actorId:randomUUID(),channel:'user-ui',permissions:['document:read','document:write']},documentId=randomUUID()
  const original=service.createDocument(context,{documentId,projectId:context.projectId,schemaVersion:'0.1.0',version:1,title:'原标题',content:{type:'doc',content:[{type:'paragraph',attrs:{blockId:randomUUID()},content:[{type:'text',text:'保留的正文'}]}]},annotations:[],referencedArtifactIds:[],updatedAt:new Date().toISOString()})
  const input=title=>({documentId,expectedVersion:1,title,requestId:randomUUID(),idempotencyKey:randomUUID()})
  return{service,context,documentId,original,input}
}
test('renaming persists both title and version while preserving all content, annotations and references',()=>{
  const f=fixture();try{
    const renamed=f.service.rename(f.context,f.input('  新标题 😀  '))
    assert.equal(renamed.title,'新标题 😀');assert.equal(renamed.version,2)
    assert.deepEqual(renamed.content,f.original.content);assert.deepEqual(renamed.annotations,f.original.annotations);assert.deepEqual(renamed.referencedArtifactIds,f.original.referencedArtifactIds)
    assert.equal(f.service.load(f.context,f.documentId).title,'新标题 😀')
    assert.equal(f.service.db.prepare("SELECT action FROM audit WHERE action='document.renamed'").get().action,'document.renamed')
    const saved=f.service.save(f.context,{documentId:f.documentId,expectedVersion:2,content:renamed.content,annotations:renamed.annotations,requestId:randomUUID(),idempotencyKey:randomUUID()})
    assert.equal(saved.title,'新标题 😀');assert.equal(saved.version,3)
  }finally{f.service.close()}
})
test('title retries are idempotent and stale saves cannot overwrite a renamed document',()=>{
  const f=fixture();try{
    const input=f.input('新标题'),one=f.service.rename(f.context,input)
    assert.deepEqual(f.service.rename(f.context,input),one)
    assert.equal(f.service.load(f.context,f.documentId).version,2)
    assert.throws(()=>f.service.rename(f.context,{...input,title:'其他标题'}),e=>e.code==='IDEMPOTENCY_MISMATCH')
    assert.throws(()=>f.service.rename(f.context,f.input('过期标题')),e=>e.code==='VERSION_CONFLICT')
    assert.throws(()=>f.service.save(f.context,{documentId:f.documentId,expectedVersion:1,content:f.original.content,annotations:[],requestId:randomUUID(),idempotencyKey:randomUUID()}),e=>e.code==='VERSION_CONFLICT')
    assert.equal(f.service.load(f.context,f.documentId).title,'新标题')
  }finally{f.service.close()}
})
test('invalid titles, unauthorized projects and read-only contexts cannot rename a document',()=>{
  const f=fixture();try{
    for(const title of ['', '   ','x'.repeat(201),'line\nbreak','x\u0000y',null,123])assert.throws(()=>f.service.rename(f.context,f.input(title)))
    assert.throws(()=>f.service.rename(f.context,{...f.input('x'),content:{}}))
    assert.throws(()=>f.service.rename({...f.context,permissions:['document:read']},f.input('x')),e=>e.code==='SCOPE_DENIED')
    assert.throws(()=>f.service.rename({...f.context,projectId:randomUUID()},f.input('x')))
    assert.equal(f.service.load(f.context,f.documentId).version,1)
  }finally{f.service.close()}
})
test('saving an unchanged title does not invalidate existing document versions',()=>{
  const f=fixture();try{
    const input=f.input(' 原标题 ')
    assert.equal(f.service.rename(f.context,input).version,1)
    assert.equal(f.service.rename(f.context,input).version,1)
  }finally{f.service.close()}
})
test('uncertain rename retries settle the same request before later title edits',async()=>{
  const f=fixture(),inputs=[];let loseResponse=true
  class WorkbenchError extends Error{constructor(code){super(code);this.code=code}}
  const context=vm.createContext({s:true,p:false,Ze:{current:false},mimirRenameBusy:{current:false},mimirPendingRename:{current:null},mimirDocumentTitle:f.original.title,
    mimirSetRenaming(){},mimirSetDocumentTitle(title){context.mimirDocumentTitle=title},Fe:{current:null},Ge:{current:false},st:{current:1},r:{documentId:f.documentId},o(){},c(){},u(){},Hi:error=>error.message,Zt:WorkbenchError,crypto:{randomUUID},gn:async()=>true,
    e:{rename:async input=>{inputs.push({...input});const result=f.service.rename(f.context,input);if(loseResponse){loseResponse=false;throw new WorkbenchError('UPSTREAM_UNAVAILABLE')}return result}},})
  vm.runInContext(readFileSync('growth/client/document-title-controller.js','utf8')+'\nglobalThis.rename=mimirRenameDocument;',context)
  try{
    assert.equal(await context.rename('已提交但丢响应'),false)
    assert.ok(context.mimirPendingRename.current)
    assert.equal(await context.rename('用户随后改成另一个标题'),true)
    assert.equal(inputs.length,3);assert.equal(inputs[0].idempotencyKey,inputs[1].idempotencyKey)
    assert.equal(inputs[2].expectedVersion,2);assert.equal(context.st.current,3)
    assert.equal(f.service.load(f.context,f.documentId).title,'用户随后改成另一个标题')
    assert.equal(context.mimirPendingRename.current,null)
  }finally{f.service.close()}
})
