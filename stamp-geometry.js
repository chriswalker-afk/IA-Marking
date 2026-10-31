/*
 * Content-aware on-page annotation assistance.
 * PDF.js selectable text is used only as a soft obstacle: mathematical images,
 * vector diagrams and scans still require the teacher to inspect the page.
 * No student's text is removed, modified or sent to a server.
 */
export function selectableTextRectangles(items=[],pageWidth=595,pageHeight=842){
  const safe=[];
  for(const item of items){
    const x=Number(item?.transform?.[4]),baseline=Number(item?.transform?.[5]);
    const w=Number(item?.width);
    if(!String(item?.str||'').trim()||!Number.isFinite(x)||!Number.isFinite(baseline)||
      !Number.isFinite(w)||w<=0)continue;
    const h=Math.max(5,Math.abs(Number(item.height)||Number(item?.transform?.[3])||9));
    const raw={x,y:pageHeight-baseline-h*.8,width:w,height:h*1.25};
    // Clip to the actual PDF page. Some PDFs have negative transformed bounds.
    const left=Math.max(0,Math.min(pageWidth,raw.x));
    const top=Math.max(0,Math.min(pageHeight,raw.y));
    const right=Math.max(left,Math.min(pageWidth,raw.x+raw.width));
    const bottom=Math.max(top,Math.min(pageHeight,raw.y+raw.height));
    if(right>left&&bottom>top)safe.push({x:left,y:top,width:right-left,height:bottom-top});
  }
  return safe;
}
export function textCoverage(box,rects=[]){
  if(!rects?.length)return 0;
  let covered=0;
  for(const rect of rects){
    const w=Math.min(box.x+box.width,rect.x+rect.width)-Math.max(box.x,rect.x);
    if(w<=0)continue;
    const h=Math.min(box.y+box.height,rect.y+rect.height)-Math.max(box.y,rect.y);
    if(h>0)covered+=w*h;
  }
  return Math.round(covered*10)/10;
}
/** Try widths without decreasing legibility or cutting off any lines. */
export function compactWidth({currentWidth=230,minWidth=150,measure}){
  if(typeof measure!=='function')throw Error('A text-measurement function is required');
  const ceiling=Math.max(minWidth,Math.min(450,Math.round(currentWidth/5)*5));
  let best=null;
  for(let width=minWidth;width<=ceiling;width+=5){
    const box=measure(width);
    if(!box?.minHeight||!box.width)continue;
    const area=box.width*box.minHeight;
    // Avoid an exceptionally narrow, tall strip on the page.
    const tooTall=Math.max(0,box.minHeight-box.width*.75);
    const penalty=tooTall*tooTall*3;
    const score=area+penalty;
    if(!best||score<best.score-1){best={width:box.width,height:box.minHeight,score,area};}
  }
  return best||{width:ceiling,height:null,score:Infinity,area:Infinity};
}
