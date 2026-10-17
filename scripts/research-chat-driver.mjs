// Scope native chat input to its own composer, after opening a new session.
export const researchComposer='[data-composer-input][contenteditable="true"]';
export const researchSend='[data-composer-card] button[aria-label="发送消息"]:not([disabled]),[data-composer-card] button[aria-label="Send message"]:not([disabled])';
export const researchReply='.hWmORq_root:not([data-streaming]) .hWmORq_body';
export async function openResearchChat(browser){
  await browser.waitFor('Boolean(document.querySelector(".mimir-product-nav button[aria-label=研究]"))');
  await browser.evaluate('document.querySelector(".mimir-product-rail-end button[aria-label=展开侧栏]")?.click()');
  await browser.evaluate('document.querySelector(".mimir-product-nav button[aria-label=研究]").click()');
  await browser.waitFor('Boolean(document.querySelector("#mimir-project-directory .mimir-product-new"))');
  await browser.evaluate('document.querySelector("#mimir-project-directory .mimir-product-new").click()');
  await browser.waitFor(`Boolean(document.querySelector(${JSON.stringify(researchComposer)}))`);
  await browser.send('Page.bringToFront');
}
export async function sendResearchChat(browser,text){
  const previousReplies=await browser.evaluate(`document.querySelectorAll(${JSON.stringify(researchReply)}).length`);
  await browser.evaluate(`document.querySelector(${JSON.stringify(researchComposer)}).focus()`);
  await browser.send('Input.insertText',{text});
  await browser.waitFor(`Boolean(document.querySelector(${JSON.stringify(researchSend)}))`);
  await browser.evaluate(`document.querySelector(${JSON.stringify(researchSend)}).click()`);
  return previousReplies;
}
export async function readNewResearchReply(browser,previousReplies=0,timeout=60000){
  await browser.waitFor(`(()=>{const replies=[...document.querySelectorAll(${JSON.stringify(researchReply)})];return replies.length>${previousReplies}&&Boolean(replies.at(-1)?.innerText.trim())})()`,timeout);
  return browser.evaluate(`[...document.querySelectorAll(${JSON.stringify(researchReply)})].at(-1).innerText`);
}
