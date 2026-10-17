import {GrowthError} from './domain.mjs'
/** Catch explicit self-contradictions; this is not a general scientific truth certificate. */
export function validatePlanAngleConsistency(task){
  for(const text of [task.title,task.objective,...(task.criteria||[])]){
    if(typeof text!=='string')continue
    const claim=/(?:第二杆|第二连杆|第二段|两者|二者)?[^。；]{0,12}全局(?:角|方向)[^。；]{0,12}(?:不同|不一样)[^。；]{0,60}前者(?:为|是|等于)?\s*([+-]?\d+(?:\.\d+)?)\s*[°度][^。；]{0,30}后者(?:为|是|等于)?\s*([+-]?\d+(?:\.\d+)?)\s*[°度]/gu
    for(const match of text.matchAll(claim)){
      const difference=Number(match[1])-Number(match[2]),wrapped=((difference%360)+360)%360
      if(Math.min(wrapped,360-wrapped)<1e-8)throw new GrowthError('INVALID_MODEL_OUTPUT','任务将两个相同的第二杆全局角称为不同；相对角定义下全局角为θ₁+θ₂，末端位置还取决于第一杆。请核对原输入，修正这一自相矛盾的完成标准后重新生成完整方案。',422)
    }
  }
}
