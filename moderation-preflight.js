/*
 * Non-destructive preflight for moderator-facing PDFs. Automatic checks are
 * warnings, never a claim that a teacher's mathematical work is unobscured.
 * Text overlap is checked when PDF.js can extract selectable source text;
 * photos, figures, formula paths and scanned pages need visual inspection.
 */
export function contrastRatio(foreground,background) {
  function luminance(hex){
    const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
    const linear=rgb.map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));
    return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
  }
  const a=luminance(foreground),b=luminance(background);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
export function rectanglesIntersect(a,b){
  const x=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x));
  const y=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  return x*y;
}
export async function inspectModerationPages({
  pdfDocument,stamps,getPageStamps,noteLayout,pageLayoutProblems,criterionKeys,marks
}) {
  const issues=[];
  const note=(severity,message,page=null)=>issues.push({severity,message,page});
  if(stamps.length===0)note('warning','No on-page evidence stamps have been placed.');
  const unmarked=criterionKeys.filter(k=>marks[k]===null);
  if(unmarked.length)note('warning','Marks not yet awarded for: '+unmarked.join(', ')+'. Export will be labelled INCOMPLETE.');
  for(let pageNumber=1;pageNumber<=pdfDocument.numPages;pageNumber++){
    const page=await pdfDocument.getPage(pageNumber);
    const vp=page.getViewport({scale:1});
    const w=vp.width,h=vp.height;
    const pageStamps=getPageStamps(pageNumber);
    const layout=pageLayoutProblems(pageStamps,w,h);
    for(const problem of layout.problems)note('error',problem,pageNumber);
    for(const {stamp,layout:box} of layout.items){
      const id=stamp.label||stamp.criterion;
      if(box.fontSize<9)note('warning','Page '+pageNumber+': '+id+' uses '+box.fontSize+' pt text. Check moderator readability.',pageNumber);
      if(contrastRatio(box.textColor,box.fillColor)<4.5){
        note('warning','Page '+pageNumber+': '+id+' text/background contrast is below 4.5:1.',pageNumber);
      }
    }
    if(page.rotate%360!==0){
      note('warning','Page '+pageNumber+' is rotated. Check on-page stamp alignment in the rendered export.',pageNumber);
      continue;
    }
    try {
      const extracted=await page.getTextContent();
      const items=extracted.items.filter(item=>item.str?.trim() && item.width>0);
      if(!items.length){
        if(pageStamps.length)note('warning','Page '+pageNumber+' has no selectable PDF text. It may be scanned: manually inspect all mathematical content under comments.',pageNumber);
        continue;
      }
      const collisions=new Set();
      for(const {stamp,layout:box} of layout.items){
        for(const item of items){
          // PDF.js text transforms use a bottom-left baseline; annotations
          // use a top-left origin. Allow padding for ascenders/descenders.
          const textHeight=Math.max(5,Math.abs(item.height||item.transform[3]||9));
          const rect={
            x:item.transform[4],
            y:h-item.transform[5]-textHeight*.8,
            width:Math.max(1,item.width),
            height:textHeight*1.25,
          };
          const overlap=rectanglesIntersect(box,rect);
          if(overlap>Math.min(rect.width*rect.height*.18,16)){
            collisions.add(stamp.id);
            break;
          }
        }
      }
      if(collisions.size){
        note('warning','Page '+pageNumber+': '+collisions.size+' annotation'+(collisions.size===1?' may':'s may')+' cover selectable student text. Reposition or visually verify in the exact PDF preview.',pageNumber);
      }
    }catch(error){
      note('warning','Page '+pageNumber+': source text could not be inspected. Check the rendered PDF manually.',pageNumber);
    }
  }
  if(!issues.length)note('info','No automatic preflight warnings. Visually check all pages for diagrams, scans and comments anyway.');
  return issues;
}
