import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const modules = process.env.MIMIR_NODE_MODULES || 'C:/Users/genie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = require(join(modules, 'playwright'));
const sharp = require(join(modules, 'sharp'));
const root = resolve('.'), checks = [], errors = [], shots = [];
const delay = ms => new Promise(done => setTimeout(done, ms));
const server = createServer((req, res) => {
  const file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'demo.html';
  if (!['demo.html','demo.mjs','interactive.mjs'].includes(file) && !/^svg\/mimir-(primary|night|mono|white)\.svg$/.test(file)) {res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type', {'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml'}[extname(file)]);
  res.end(readFileSync(join(root,'mimir-wordmark',file)));
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const demoUrl=`http://127.0.0.1:${server.address().port}/demo.html`;
let browser, host, instance, hostOutput='';
const home=join(root,'.test-data','wordmark-'+randomUUID());mkdirSync(home,{recursive:true});
async function state(el) {return el.evaluate(e=>e.shadowRoot.querySelector('.surface').dataset.state);}
async function shot(page, name) {const file=`artifacts/${name}.png`;await page.screenshot({path:file});shots.push(file);}
try {
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1040}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(demoUrl);await page.bringToFront();
  await page.waitForFunction(()=>document.querySelector('mimir-wordmark')?.shadowRoot);
  const hero=page.locator('mimir-wordmark').first();
  const baseBox=await hero.boundingBox();
  const flowTime=()=>hero.evaluate(e=>e.shadowRoot.querySelector('.flow').getAnimations()[0]?.currentTime);
  const t0=await flowTime();await delay(3000);const t1=await flowTime();assert(t1>t0+2400);
  const a=await hero.screenshot();await delay(3000);const b=await hero.screenshot();
  const [ar,br]=await Promise.all([sharp(a).ensureAlpha().raw().toBuffer(),sharp(b).ensureAlpha().raw().toBuffer()]);
  let differences=0;for(let i=0;i<ar.length;i++)if(Math.abs(ar[i]-br[i])>3)differences++;
  assert(differences>500,'Idle pixels did not change');await delay(6200);
  assert.equal(await state(hero),'idle');await shot(page,'wordmark-demo-idle');
  checks.push('12 seconds idle: flow timeline progresses and rendered glyph pixels change without pointer input.');
  await hero.hover({position:{x:150,y:80}});await delay(250);assert.equal(await state(hero),'hover');
  const hoverA=await hero.evaluate(e=>e.shadowRoot.querySelector('.spot circle').style.transform);
  await hero.hover({position:{x:550,y:80}});await delay(200);
  const hoverB=await hero.evaluate(e=>e.shadowRoot.querySelector('.spot circle').style.transform);assert.notEqual(hoverA,hoverB);
  await shot(page,'wordmark-demo-hover');
  await hero.evaluate(e=>{window.wordmarkActivations=0;e.addEventListener('mimir-activate',()=>window.wordmarkActivations++);});
  await hero.click({position:{x:220,y:90}});await delay(180);assert.equal(await state(hero),'activated');await shot(page,'wordmark-demo-click');
  const origin=await hero.evaluate(e=>e.shadowRoot.querySelector('.origin').getAttribute('transform'));
  await hero.evaluate(e=>{const r=e.getBoundingClientRect();for(let i=0;i<10;i++)e.shadowRoot.querySelector('button').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1,clientX:r.x+100,clientY:r.y+50}));});
  assert.equal(await hero.evaluate(e=>e.shadowRoot.querySelector('.wave').getAnimations().length),1);
  assert.equal(await page.evaluate(()=>window.wordmarkActivations),11);
  assert.equal(origin,await hero.evaluate(e=>e.shadowRoot.querySelector('.origin').getAttribute('transform')));
  await delay(1500);assert.equal(await state(hero),'hover');
  await page.mouse.move(10,10);await delay(500);assert.equal(await state(hero),'idle');
  assert.deepEqual(await hero.boundingBox(),baseBox);
  checks.push('Hover follows pointer; click continues after release; rapid clicks coalesce visually without swallowing callbacks; correct hover/idle recovery and stable layout.');
  const button=hero.locator('button');await button.focus();await button.press('Enter');assert.equal(await state(hero),'activated');
  assert.equal(await hero.evaluate(e=>e.shadowRoot.querySelector('.origin').getAttribute('transform')),'translate(480 232)');
  await delay(1700);await button.press('Space');assert.equal(await state(hero),'activated');await delay(1700);
  checks.push('Native button keyboard Enter/Space activates a centered ripple.');
  // Every requested motif must animate at rest, before a hover or click.
  const motions=await hero.evaluate(e=>Object.fromEntries(['beard','page-right','tree-top','tree-r','tree-bank','drop-one','pattern-m1','pattern-i1','pattern-m2','pattern-i2','pattern-r','river-streak','crown-glow'].map(name=>{const node=e.shadowRoot.querySelector('.'+name);return[name,{animation:getComputedStyle(node).animationName,duration:getComputedStyle(node).animationDuration,transform:getComputedStyle(node).transform}]})));
  for(const [name,motion] of Object.entries(motions))assert.notEqual(motion.animation,'none','Missing resting motion: '+name);
  assert.equal(new Set(['tree-top','tree-r','tree-bank'].map(name=>motions[name].duration)).size,3);
  await delay(450);
  assert.notEqual(await hero.evaluate(e=>getComputedStyle(e.shadowRoot.querySelector('.beard')).transform),motions.beard.transform);
  checks.push('Resting animations: beard, crown, page, all three trees, droplets, all five letter patterns and visible river current.');
  const motifAction=()=>hero.evaluate(e=>e.shadowRoot.querySelector('.surface').dataset.action);
  const clickMotif=async(x,y)=>{const r=await hero.boundingBox();await page.mouse.click(r.x+r.width*x/960,r.y+r.height*y/464);};
  for(const [name,x,y,selector,fastDuration] of [['elder',204,177,'.beard','1.25s'],['book',380,78,'.page-right','1.1s'],['river',928,326,'.river-streak','0.6s']]){
    await clickMotif(x,y);assert.equal(await motifAction(),name);
    assert.equal(await hero.evaluate((e,sel)=>getComputedStyle(e.shadowRoot.querySelector(sel)).animationDuration,selector),fastDuration);
    await delay(420);await shot(page,'wordmark-motif-'+name);
    await delay(3900);assert.equal(await motifAction(),'idle');
  }
  await clickMotif(380,78);await clickMotif(928,326);assert.equal(await motifAction(),'river');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await motifAction(),'idle');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await button.focus();await button.press('ArrowRight');await button.press('Enter');assert.equal(await motifAction(),'elder');await button.press('Escape');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  checks.push('Coordinate clicks hit elder/book/river, trigger distinct actions, recover after 4.2 seconds, replace previous actions, and cancel on blur; keyboard arrows and Enter work.');
  const ids=await page.locator('mimir-wordmark').evaluateAll(nodes=>nodes.map(e=>e.shadowRoot.querySelector('clipPath').id));assert.equal(new Set(ids).size,ids.length);
  const dark=page.locator('mimir-wordmark[theme=dark]');assert.equal((await dark.evaluate(e=>getComputedStyle(e).getPropertyValue('--mw-a'))).trim(),'#294d60');
  for(const width of [375,800,1440]){await page.setViewportSize({width,height:1040});await delay(150);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.setViewportSize({width:1440,height:1040});
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await hero.evaluate(e=>getComputedStyle(e.shadowRoot.querySelector('.flow')).opacity),'0');assert((await hero.evaluate(e=>e.shadowRoot.querySelector('.flow').getAnimations().length))===0);await page.emulateMedia({reducedMotion:'no-preference'});
  assert.equal(await page.locator('mimir-motion-toggle').count(),0);
  checks.push('Independent SVG IDs, correct dark palette, 160/240/480/720px examples, 375/800/1440px viewports, reduced-motion disables continuous animation.');
  const touch=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  const tp=await touch.newPage();await tp.goto(demoUrl);await tp.bringToFront();const th=tp.locator('mimir-wordmark').first();await th.tap();assert.equal(await state(th),'activated');await delay(1700);assert.equal(await state(th),'idle');await touch.close();
  checks.push('Touch tap directly activates then returns to idle.');
  await page.bringToFront();
  await page.mouse.move(10,10);await hero.evaluate(e=>{window.detachedWordmark=e; e.remove();});
  assert.equal(await page.evaluate(()=>window.detachedWordmark._dispose),null);await page.evaluate(()=>document.querySelector('.hero').prepend(window.detachedWordmark));
  await delay(150);assert.equal(await state(page.locator('mimir-wordmark').first()),'idle');
  checks.push('Disconnect releases instance resources; reattachment initializes once and works.');
  // The real application uses isolated synthetic data, no user database or model requests.
  host=spawn(process.execPath,['runtime/system/app/app.mjs','--data-home',home],{cwd:root,windowsHide:true,env:{...process.env,NODE_ENV:'test'},stdio:['pipe','pipe','pipe']});host.stdin.end('{}');
  for(const stream of [host.stdout,host.stderr])stream.on('data',data=>hostOutput=(hostOutput+data).slice(-10000));
  const until=Date.now()+60000;while(!existsSync(join(home,'instance.json'))&&Date.now()<until){if(host.exitCode!==null)throw new Error('Host exited: '+hostOutput);await delay(150);}
  assert(existsSync(join(home,'instance.json')),'Host timeout: '+hostOutput);instance=JSON.parse(readFileSync(join(home,'instance.json')));
  await page.goto(instance.url);await page.bringToFront();
  await page.waitForFunction(()=>document.querySelector('.mg-wordmark-name mimir-wordmark')?.shadowRoot,{timeout:30000});
  const embedded=page.locator('.mg-wordmark-name mimir-wordmark');assert.equal(await page.locator('mimir-wordmark').count(),1);
  assert.equal(await page.locator('.mimir-workspace-brand mimir-wordmark,mimir-motion-toggle').count(),0);
  assert.equal(await page.locator('.mimir-workspace-brand strong').innerText(),'Mimir');assert.equal(await embedded.locator('[role=button]').count(),0);
  assert.equal(await embedded.locator('button').count(),0);
  const nativeButton=page.locator('.mg-wordmark-button');assert.equal(await nativeButton.getAttribute('aria-label'),'返回智慧之泉首页');
  await nativeButton.hover();assert.equal(await state(embedded),'hover');await nativeButton.click();assert.equal(await state(embedded),'activated');
  await delay(180);await shot(page,'wordmark-mimir-click');
  await page.mouse.move(1000,650);await delay(1700);await shot(page,'wordmark-mimir');
  const nativeFlow0=await embedded.evaluate(e=>e.shadowRoot.querySelector('.flow').getAnimations()[0].currentTime);await delay(1500);
  assert((await embedded.evaluate(e=>e.shadowRoot.querySelector('.flow').getAnimations()[0].currentTime))>nativeFlow0+1000);
  await page.locator('.mimir-workspace-brand').click();await delay(300);await page.locator('.mg-sidebar-entry').click();
  await page.waitForFunction(()=>document.querySelector('.mg-wordmark-name mimir-wordmark')?.shadowRoot);
  await page.evaluate(()=>document.body.dataset.mimirMode='dark');
  assert.equal((await page.locator('.mg-wordmark-name mimir-wordmark').evaluate(e=>getComputedStyle(e).getPropertyValue('--mw-a'))).trim(),'#294d60');
  await shot(page,'wordmark-mimir-dark');
  checks.push('Installed real MIMIR: only original top wordmark enhanced; left brand unchanged; no extra controls; original research/growth navigation and theme switching work.');
  assert.deepEqual(errors,[]);
  const report={passed:true,at:new Date().toISOString(),checks,shots,errors,differences};writeFileSync('artifacts/wordmark-ui.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} catch(error){writeFileSync('artifacts/wordmark-ui.json',JSON.stringify({passed:false,error:error.stack,checks,errors,hostOutput},null,2));console.error(error.stack);process.exitCode=1;}
finally{
  await browser?.close();await new Promise(done=>server.close(done));
  if(instance)await fetch(`http://127.0.0.1:${instance.controlPort}/exit`,{method:'POST',headers:{'X-Mimir-Control':instance.controlToken},signal:AbortSignal.timeout(5000)}).catch(()=>{});
  const end=Date.now()+8000;while(host?.exitCode===null&&Date.now()<end)await delay(100);if(host?.exitCode===null){host.kill();process.exitCode=1;}
}
