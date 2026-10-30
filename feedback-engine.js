/* Pure first-draft student-feedback helpers. All change requests come from
 * actual teacher-placed limitation stamps, never generic automated grading. */
export const FEEDBACK_PRIORITIES=Object.freeze(['high','normal','low']);
export function feedbackPriority(value){
  return FEEDBACK_PRIORITIES.includes(value)?value:'normal';
}
export function feedbackStampCollections(project,mode){
  return {
    marking:mode==='marking'?project.stamps:project.markingStamps,
    feedback:mode==='feedback'?project.stamps:project.feedbackStamps,
  };
}
export function studentChecklistItems(stamps=[],completed={}){
  const counters={A:0,B:0,C:0,D:0,E:0};
  return (Array.isArray(stamps)?stamps:[]).map(stamp=>{
    if(!Object.hasOwn(counters,stamp.criterion))return null;
    const label=stamp.criterion+(++counters[stamp.criterion]);
    return {...stamp,label};
  }).filter(stamp=>stamp && stamp.tone==='limitation' && String(stamp.text||'').trim()).map(stamp=>({
    id:String(stamp.id),label:stamp.label,criterion:stamp.criterion,
    page:stamp.page,topic:String(stamp.topic||'Revision'),
    text:String(stamp.text).trim(),priority:feedbackPriority(stamp.priority),
    completed:completed?.[stamp.id]===true,
  })).sort((a,b)=>({high:0,normal:1,low:2}[a.priority]-{high:0,normal:1,low:2}[b.priority]
    ||a.criterion.localeCompare(b.criterion)||a.page-b.page||a.label.localeCompare(b.label));
}
export function studentFeedbackStrengths(stamps=[]){
  const counters={A:0,B:0,C:0,D:0,E:0};
  return (Array.isArray(stamps)?stamps:[]).map(stamp=>{
    if(!Object.hasOwn(counters,stamp.criterion))return null;
    return {...stamp,label:stamp.criterion+(++counters[stamp.criterion])};
  }).filter(stamp=>stamp&&stamp.tone==='strength'&&String(stamp.text||'').trim());
}
export function studentChecklistText({stamps=[],completed={},course='',candidate='',session=''}={}){
  const tasks=studentChecklistItems(stamps,completed),strengths=studentFeedbackStrengths(stamps);
  const lines=[
    'FIRST DRAFT - MATHEMATICS IA FEEDBACK',
    'Course: '+(course||'Not set')+' | Assessment ID: '+(candidate||'Not set'),
    'Session: '+(session||'Not set'),
    'Teacher feedback only. These prompts identify areas to review; the mathematical decisions and revisions remain yours.',
    '',
    'WHAT IS WORKING WELL',
  ];
  if(!strengths.length)lines.push('No strengths noted yet.');
  else strengths.forEach(item=>lines.push('- '+item.label+' | Page '+item.page+' | '+String(item.text).trim()));
  lines.push('','YOUR REVISION CHECKLIST');
  if(!tasks.length)lines.push('No changes requested yet.');
  for(const item of tasks)lines.push((item.completed?'[x] ':'[ ] ')+item.label+' | Page '+item.page+
    ' | '+(item.priority==='high'?'HIGH PRIORITY':item.priority==='low'?'LOW PRIORITY':'STANDARD')+
    ' | '+item.topic+'\n    '+item.text);
  lines.push('','Check each item as you revise. Ask your teacher for clarification where necessary, but keep your own mathematical reasoning and writing.');
  return lines.join('\n');
}
