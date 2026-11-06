/*
 * Annotation geometry shared by the live PDF overlay and exported PDF.
 * All stored positions use page fractions (not screen pixels), so zoom,
 * autosave and portable project backups preserve the exact anchors.
 */
export const MIN_NOTE_WIDTH=70;
export const MAX_NOTE_WIDTH=550;
export const MIN_NOTE_FONT=5;
export const MAX_NOTE_FONT=18;

export function normalNoteMode(value){
  return value==='slim'?'slim':'standard';
}
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const fraction=value=>clamp(Number(value)||0,0,1);

export function normalTextAnchor(anchor){
  if(!anchor||typeof anchor!=='object')return null;
  if(!['highlight','underline'].includes(anchor.kind))return null;
  const x=Number(anchor.x),y=Number(anchor.y),width=Number(anchor.width),height=Number(anchor.height);
  if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)return null;
  const left=fraction(x),top=fraction(y);
  const right=clamp(left+width,left,1),bottom=clamp(top+height,top,1);
  if(right-left<.003||bottom-top<.002)return null;
  return {kind:anchor.kind,x:left,y:top,width:right-left,height:bottom-top};
}

export function textAnchorFromDrag(start,end,kind){
  if(!start||!end)return null;
  return normalTextAnchor({
    x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),
    width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y),
    kind,
  });
}

export function textAnchorRect(anchor,pageWidth,pageHeight){
  const normal=normalTextAnchor(anchor);
  return normal?{
    kind:normal.kind,x:normal.x*pageWidth,y:normal.y*pageHeight,
    width:normal.width*pageWidth,height:normal.height*pageHeight,
  }:null;
}

export function markerGeometry(stamp,box,pageWidth,pageHeight){
  const size=clamp(Number(stamp.size)||18,14,42);
  const defaultX=box.x>=size+5?box.x-size-4
    :box.x+box.width+size+5<=pageWidth?box.x+box.width+4
    :box.x+2;
  const defaultY=defaultX===box.x+2?box.y-size-3:box.y;
  const rawX=stamp.markerX===null||stamp.markerX===undefined?defaultX:Number(stamp.markerX)*pageWidth;
  const rawY=stamp.markerY===null||stamp.markerY===undefined?defaultY:Number(stamp.markerY)*pageHeight;
  const x=clamp(Number.isFinite(rawX)?rawX:defaultX,1,Math.max(1,pageWidth-size-1));
  const y=clamp(Number.isFinite(rawY)?rawY:defaultY,1,Math.max(1,pageHeight-size-1));
  return {x,y,size,cx:x+size/2,cy:y+size/2};
}

export function nearestBorderPoint(point,rect){
  const x=clamp(point.x,rect.x,rect.x+rect.width);
  const y=clamp(point.y,rect.y,rect.y+rect.height);
  if(point.x<rect.x||point.x>rect.x+rect.width||
    point.y<rect.y||point.y>rect.y+rect.height)return {x,y};
  const choices=[
    {x:rect.x,y:point.y,d:point.x-rect.x},
    {x:rect.x+rect.width,y:point.y,d:rect.x+rect.width-point.x},
    {x:point.x,y:rect.y,d:point.y-rect.y},
    {x:point.x,y:rect.y+rect.height,d:rect.y+rect.height-point.y},
  ];
  return choices.sort((a,b)=>a.d-b.d)[0];
}

export function markerLeader(marker,box){
  const target=nearestBorderPoint({x:marker.cx,y:marker.cy},box);
  const dx=target.x-marker.cx,dy=target.y-marker.cy;
  const distance=Math.hypot(dx,dy);
  if(distance<=marker.size/2+.6)return null;
  const ratio=(marker.size/2)/distance;
  return {x1:marker.cx+dx*ratio,y1:marker.cy+dy*ratio,x2:target.x,y2:target.y};
}

export function annotationGeometry(stamp,box,pageWidth,pageHeight){
  const anchor=textAnchorRect(stamp.textAnchor,pageWidth,pageHeight);
  const detached=Boolean(stamp.markerDetached)||normalNoteMode(stamp.noteMode)==='slim'||Boolean(anchor);
  if(!detached)return {detached:false,marker:null,leader:null,anchor,anchorLeader:null};
  const marker=markerGeometry(stamp,box,pageWidth,pageHeight);
  return {
    detached:true,marker,anchor,
    leader:markerLeader(marker,box),
    anchorLeader:anchor?markerLeader(marker,anchor):null,
  };
}
