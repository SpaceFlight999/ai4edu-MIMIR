import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { patchWorkbenchFunctions } from './workbench-functional-patches.mjs'
const wordmark = readFileSync('mimir-wordmark/interactive.mjs', 'utf8').replace(/^export /gm, '')
const displayVersion = JSON.parse(readFileSync('growth/package.json', 'utf8')).version
const source = 'const MIMIR_DISPLAY_VERSION = ' + JSON.stringify(displayVersion) + ';\n' + wordmark + '\n' + ['daily.js', 'configuration.js', 'models.js', 'ai-status.js', 'topology.js', 'journey.js', 'robotics.js', 'study.js', 'learning.js', 'curriculum.js', 'library.js', 'app.js'].map(name => readFileSync('growth/client/' + name, 'utf8')).join('\n')
const style = ['style.css', 'navigation.css', 'topology.css', 'journey.css', 'learning.css', 'library.css', 'course.css', 'customization.css', 'prompt5.css', 'prompt6.css', 'wordmark.css', 'home-shortcuts.css'].map(name => readFileSync('growth/client/' + name, 'utf8')).join('\n')
if (/\bimport\s/.test(source)) throw new Error('Client entry must use injected runtime modules, not a second React copy.')
mkdirSync('growth/lib', { recursive: true })
writeFileSync('growth/lib/client.js', `window.__ModuleLoader__.load({ id: '@mimir/growth-layer', factory: (require) => {\nconst exports = {};\nconst GROWTH_CSS = ${JSON.stringify(style)};\n${source}\nreturn exports;\n} });\n`)
console.log('Built growth client using the existing React runtime.')
const workbenchPath = 'growth/overrides/workbench/client.js'
let workbench = readFileSync(workbenchPath, 'utf8')
const identityStart = '/* MIMIR_BLOCK_IDENTITY_START */', identityEnd = '/* MIMIR_BLOCK_IDENTITY_END */'
const identity = identityStart + '\n' + readFileSync('growth/client/block-identity.js', 'utf8') + '\n' + identityEnd
if (workbench.includes(identityStart)) {
  if (workbench.indexOf(identityEnd) < workbench.indexOf(identityStart) || workbench.split(identityStart).length !== 2 || workbench.split(identityEnd).length !== 2) throw new Error('Workbench block identity markers are invalid')
  workbench = workbench.slice(0, workbench.indexOf(identityStart)) + identity + workbench.slice(workbench.indexOf(identityEnd) + identityEnd.length)
} else {
  const opening = 'var ZP=Object.create;'
  if (!workbench.includes(opening)) throw new Error('Workbench factory insertion point missing')
  workbench = workbench.replace(opening, identity + '\n' + opening)
}
const originalIdentity = 'appendTransaction:(r,e,t)=>{let n=[];if(t.doc.descendants((s,a)=>{U_.includes(s.type.name)&&!s.attrs.blockId&&n.push({pos:a,id:crypto.randomUUID()})}),!n.length)return null;let i=t.tr;for(let s of n){let a=i.doc.nodeAt(s.pos);a&&i.setNodeMarkup(s.pos,void 0,{...a.attrs,blockId:s.id})}return i}'
const repairedIdentity = 'appendTransaction:(r,e,t)=>mimirBlockIdentityTransaction(r,e,t,U_)'
if (workbench.includes(originalIdentity)) workbench = workbench.replace(originalIdentity, repairedIdentity)
else if (!workbench.includes(repairedIdentity)) throw new Error('Workbench block identity plugin changed unexpectedly')
const splitIdentity = 'attributes:{blockId:{default:null,parseHTML:r=>r.getAttribute("data-block-id")'
const uniqueSplitIdentity = 'attributes:{blockId:{default:null,keepOnSplit:!1,parseHTML:r=>r.getAttribute("data-block-id")'
if (workbench.includes(splitIdentity)) workbench = workbench.replace(splitIdentity, uniqueSplitIdentity)
else if (!workbench.includes(uniqueSplitIdentity)) throw new Error('Workbench block identity attribute changed unexpectedly')
const reviewStart = '/* MIMIR_PROPOSAL_REVIEW_START */', reviewEnd = '/* MIMIR_PROPOSAL_REVIEW_END */'
const review = reviewStart + '\n' + readFileSync('growth/client/proposal-review.js', 'utf8') + '\n' + reviewEnd
if (workbench.includes(reviewStart)) {
  if (workbench.indexOf(reviewEnd) < workbench.indexOf(reviewStart) || workbench.split(reviewStart).length !== 2 || workbench.split(reviewEnd).length !== 2) throw new Error('Workbench review markers are invalid')
  workbench = workbench.slice(0, workbench.indexOf(reviewStart)) + review + workbench.slice(workbench.indexOf(reviewEnd) + reviewEnd.length)
} else {
  if (!workbench.includes('function Fhe(')) throw new Error('Workbench review insertion point missing')
  workbench = workbench.replace('function Fhe(', review + '\nfunction Fhe(')
}
workbench = patchWorkbenchFunctions(workbench)
writeFileSync(workbenchPath, workbench)

