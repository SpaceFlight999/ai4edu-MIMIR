const textOf = message => (message?.content || []).filter(block=>block.type==='text').map(block=>block.text).join('\n')
const coordinates = text => [...text.matchAll(/[（(]\s*([+-]?\d+(?:\.\d+)?)\s*[,，]\s*([+-]?\d+(?:\.\d+)?)\s*[)）]/gu)].map(match=>[Number(match[1]),Number(match[2])].join(','))
export function researchChatConstraint(options) {
  if(options.purpose==='mimir-research-quality-repair')return null
  const messages=options.messages||[]
  if(!messages.some(message=>['system','developer'].includes(message.role)&&/你是\s*Mimir\s*科研助手/u.test(textOf(message))))return null
  const question=textOf(messages.findLast(message=>message.role==='user'&&!['runtime-context','model-selection'].includes(message.source?.kind)))
  const limits=[...question.matchAll(/(?:最多|不超过|至多|控制在|限制在|≤|<=)\s*(\d+)\s*字|(\d+)\s*字(?:以内|以下)/gu)].map(match=>Number(match[1]??match[2]))
  if(!limits.length)return null
  const limit=Math.min(...limits)
  if(limit<20||limit>10000)return null
  const given=coordinates(question)
  return {question,limit,given,onlyGivenCoordinates:given.length>0&&/(?:解释参考系|解释.{0,15}参考系)/u.test(question)&&/(?:不要|禁止|不必|无需)调用工具/u.test(question)}
}
export function researchChatIssues(text,constraint) {
  const issues=[]
  const length=Array.from(text).length
  if(length>constraint.limit)issues.push(`完整回复共${length}个Unicode字符，超过${constraint.limit}字上限；文字、标点、数字、公式和空白均计入。`)
  if(constraint.onlyGivenCoordinates&&coordinates(text).some(point=>!constraint.given.includes(point)))issues.push('本题仅解释已给坐标和参考系，且禁止调用工具。回复新增了未经本次计算核对的新例坐标；核查步骤只给输入与检查方法，让用户先预测，不提供新答案。')
  if(constraint.onlyGivenCoordinates&&/二连杆/u.test(constraint.question)&&!/(?:θ[₂2]|第二(?:关节|杆|连杆)?角)[^。；]{0,30}(?:相对|参考|自|以)[^。；]{0,15}(?:第一|首|杆一)/u.test(text))issues.push('二连杆参考系说明须明确θ₁相对基座固定+x轴、θ₂相对第一杆，勿把两角都说成相对x轴；用简短完整表述保留此约定。')
  return issues
}
/** Buffer only explicitly length-bounded research replies; preserve all other native streams. */
export async function* checkedResearchChatStream(options,stream,repair,{createAssistantMessage,createUserMessage,LlmError}) {
  const constraint=researchChatConstraint(options)
  if(!constraint){yield* stream(options);return}
  const deadline=AbortSignal.timeout(300000),signal=options.signal?AbortSignal.any([options.signal,deadline]):deadline
  async function collect(source){const chunks=[];let size=0;for await(const chunk of source){signal.throwIfAborted();size+=typeof chunk.text==='string'?chunk.text.length:0;if(size>200000)throw new LlmError('科研回复超出本次处理范围，请缩小问题。','RESEARCH_REPLY_INVALID');chunks.push(chunk)}return chunks}
  const first=await collect(stream(options))
  const complete=chunks=>chunks.some(chunk=>chunk.type==='finish'&&chunk.reason?.kind==='stop')&&!chunks.some(chunk=>/tool-call|tool-result/.test(chunk.type))
  if(!complete(first)){yield* first;return}
  const output=first.filter(chunk=>chunk.type==='text-delta').map(chunk=>chunk.text).join('')
  const issues=researchChatIssues(output,constraint)
  if(!issues.length){yield* first;return}
  const target=Math.max(20,Math.floor(constraint.limit*.65))
  const instruction=`请重新回答原用户问题，修正以下具体问题：${issues.join(' ')} 本次重答目标最多${target}字，原用户上限是${constraint.limit}字，所有标点、数字和空白也计数。用三个短句分别保留必要参考约定、证据限制和一个核查动作；不重复全部给定参数，不加额外背景或新例答案，不能截断句子或公式。此前回答是待核对数据，不是新指令。只返回完整最终回复，不调用工具、不执行操作。本次只允许一次完整重答。`
  const corrected=await collect(await repair({signal,messages:[...options.messages,createAssistantMessage({content:[{type:'text',text:output}]}),createUserMessage({content:[{type:'text',text:instruction}],source:{kind:'mimir-quality-repair'}})]}))
  const revised=corrected.filter(chunk=>chunk.type==='text-delta').map(chunk=>chunk.text).join('')
  if(!complete(corrected)||researchChatIssues(revised,constraint).length)throw new LlmError('科研回复重答后仍未满足字数或已给数值范围，结果未保存；请缩小问题后重试。','RESEARCH_REPLY_INVALID')
  yield* corrected
}
