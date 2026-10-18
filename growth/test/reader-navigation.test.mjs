import test from 'node:test'
import assert from 'node:assert/strict'
import {jumpToSection} from '../overrides/paper/viewer/reader-ui.mjs'

function fixture(){
  const calls=[]
  const pane={tagName:'ASIDE',parentElement:null,clientTop:1,scrollTop:90,scrollLeft:17,getBoundingClientRect:()=>({top:100}),querySelector:selector=>selector.includes('.tabs')?{getBoundingClientRect:()=>({height:52})}:null,scrollTo:value=>calls.push(value)}
  const parent={tagName:'DETAILS',open:false,parentElement:pane}
  const node={tagName:'DETAILS',open:false,parentElement:parent,closest:selector=>selector==='#research-analysis'?pane:null,getClientRects:()=>[{}],getBoundingClientRect:()=>({top:500}),scrollIntoView:()=>{throw Error('outer ancestor scrolling is forbidden')},focus:options=>calls.push({focus:options})}
  return {node,parent,pane,calls}
}

test('title jumps scroll only the assistant after expanding the target and all folded ancestors',()=>{
  const f=fixture(),previous=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:true})
  try{
    jumpToSection(f.node)
    assert.equal(f.node.open,true);assert.equal(f.parent.open,true)
    assert.deepEqual(f.calls,[{top:425,left:17,behavior:'auto'},{focus:{preventScroll:true}}])
  }finally{if(previous===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=previous}
})

test('targets outside the assistant never fall back to scrolling the document',()=>{
  const f=fixture();f.node.closest=()=>null
  jumpToSection(f.node);assert.deepEqual(f.calls,[])
})

test('background tabs do not move the visible assistant or steal focus',()=>{
  const f=fixture();f.node.getClientRects=()=>[]
  jumpToSection(f.node);assert.deepEqual(f.calls,[])
})

test('visible sticky thinking tasks reserve their full height; static mobile progress does not obscure destinations',()=>{
  const previousMedia=globalThis.matchMedia,previousStyle=globalThis.getComputedStyle
  globalThis.matchMedia=()=>({matches:true})
  try{
    for(const [position,height,top] of [['sticky',80,339],['sticky',180,239],['static',180,425]]){
      const f=fixture(),query=f.pane.querySelector,thinking={getClientRects:()=>[{}],getBoundingClientRect:()=>({height})}
      f.pane.querySelector=selector=>selector.includes('.thinking-panel')?thinking:query(selector)
      globalThis.getComputedStyle=node=>node===thinking?{position,top:'42px'}:{paddingTop:'16px'}
      jumpToSection(f.node);assert.equal(f.calls[0].top,top)
    }
  }finally{
    if(previousMedia===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=previousMedia
    if(previousStyle===undefined)delete globalThis.getComputedStyle;else globalThis.getComputedStyle=previousStyle
  }
})
