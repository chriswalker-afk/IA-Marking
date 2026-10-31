/*
 * Student-facing IA checklist PDF renderer.
 *
 * Used identically for the standalone checklist and for the checklist pages
 * appended to a teacher-annotated first draft. Only placed draft-feedback
 * stamps are accepted. This module contains no criterion marks and no
 * teacher assessment rationales; it never replaces student mathematical work.
 *
 * Fonts are the site's existing Unicode Noto PDF wrappers, so mathematical
 * symbols are checked and embedded exactly as in the annotated export.
 */
import {studentChecklistItems,studentFeedbackStrengths} from './feedback-engine.js';
import {normaliseAnnotationText} from './unicode-fonts.js';

export function makeStudentChecklistModel({stamps=[],completed={},course='',candidate='',session=''}={}){
  return {
    tasks:studentChecklistItems(stamps,completed),
    strengths:studentFeedbackStrengths(stamps),
    course:String(course||'Not specified'),
    candidate:String(candidate||'Not entered'),
    session:String(session||'Not entered'),
  };
}

export function appendStudentChecklistPages({document,rgb,fonts,model}){
  if(!document?.addPage||!rgb||!fonts?.regular||!fonts?.bold)throw new Error('Checklist PDF support is unavailable.');
  const {regular,bold}=fonts;
  const {tasks,strengths,course,candidate,session}=model;
  const W=595,H=842,L=42,R=553,BOTTOM=62,CONTENT_WIDTH=R-L;
  const navy=rgb(.12,.22,.30);
  const teal=rgb(.17,.41,.46);
  const ink=rgb(.20,.30,.38);
  const muted=rgb(.39,.49,.56);
  const pale=rgb(.95,.97,.98);
  const white=rgb(1,1,1);
  const border=rgb(.82,.87,.90);
  const orange=rgb(.68,.42,.16);
  const priorities={
    high:{label:'HIGH PRIORITY  |  Address first',color:orange},
    normal:{label:'STANDARD REVISIONS',color:teal},
    low:{label:'LOWER PRIORITY  |  Final polish',color:muted},
  };
  const pages=[];
  let page=null,top=0,sectionIndex=0;
  const draw=(value,x,y,size=10,font=regular,color=ink,p=page)=>{
    // The existing font wrapper checks mathematical glyphs rather than
    // silently dropping, substituting or rasterising unsupported characters.
    font.draw(p,normaliseAnnotationText(value),x,y,size,color);
  };
  function wrap(value,font,size,width){
    const lines=[];
    const paragraphs=normaliseAnnotationText(value).split('\n');
    for(const paragraph of paragraphs){
      const words=paragraph.split(/\s+/u).filter(Boolean);
      let line='';
      for(const word of words){
        const trial=line?line+' '+word:word;
        if(font.widthOfTextAtSize(trial,size)<=width){line=trial;continue;}
        if(line){lines.push(line);line='';}
        if(font.widthOfTextAtSize(word,size)<=width){line=word;continue;}
        let part='';
        for(const char of Array.from(word)){
          if(part && font.widthOfTextAtSize(part+char,size)>width){lines.push(part);part='';}
          part+=char;
        }
        line=part;
      }
      lines.push(line);
    }
    return lines.length?lines:[''];
  }
  function newPage(){
    page=document.addPage([W,H]);
    pages.push(page);
    page.drawRectangle({x:0,y:H-12,width:W,height:12,color:navy});
    page.drawRectangle({x:L,y:H-67,width:4,height:32,color:teal});
    draw('IB MATHEMATICS  /  FIRST DRAFT STUDENT FEEDBACK',L+14,H-38,9,bold,teal);
    draw(pages.length===1?'Student revision checklist':'Revision checklist  |  continued',L+14,H-58,16.5,bold,navy);
    page.drawLine({start:{x:L,y:H-79},end:{x:R,y:H-79},thickness:1,color:border});
    top=H-105;
  }
  function ensure(height){
    if(!page || top-height<BOTTOM)newPage();
  }
  function paragraph(value,{x=L,size=10,font=regular,color=ink,width=CONTENT_WIDTH,line=14,after=10}={}){
    const lines=wrap(value,font,size,width);
    for(const row of lines){
      ensure(line);
      draw(row,x,top,size,font,color);
      top-=line;
    }
    top-=after;
  }
  function rule(){
    ensure(14);
    page.drawLine({start:{x:L,y:top},end:{x:R,y:top},thickness:.7,color:border});
    top-=14;
  }
  function heading(label,count){
    ensure(44);
    top-=5;
    draw(label,L,top,12,bold,navy);
    if(Number.isInteger(count)){
      const labelCount=count+' '+(count===1?'item':'items');
      draw(labelCount,R-bold.widthOfTextAtSize(labelCount,9),top,9,bold,muted);
    }
    top-=15;
    rule();
  }
  function metadata(label,value,x,width){
    // Metadata can be longer than one line; preserve the full identifier.
    const lines=wrap(label+': '+value,regular,9.5,width);
    for(const row of lines){
      ensure(15);
      draw(row,x,top,9.5,regular,ink);
      top-=15;
    }
  }
  newPage();
  paragraph('Use these teacher-selected comments to make your own improvements. Refer to the stamped page for context; do not copy a replacement solution.',{
    size:10.3,color:muted,line:15,after:12,
  });
  metadata('Course',course,L,175);
  metadata('Assessment ID',candidate,L,CONTENT_WIDTH);
  metadata('Session',session,L,CONTENT_WIDTH);
  top-=6;
  ensure(43);
  page.drawRectangle({x:L,y:top-32,width:CONTENT_WIDTH,height:35,color:pale,borderColor:border,borderWidth:.6});
  draw(strengths.length+' strengths noted',L+12,top-14,10.5,bold,teal);
  draw(tasks.length+' revision actions',L+285,top-14,10.5,bold,teal);
  top-=48;

  heading('What is working well',strengths.length);
  if(!strengths.length)paragraph('No strengths have been recorded yet.',{color:muted,after:12});
  for(const item of strengths){
    const content=wrap(item.text,regular,9.8,CONTENT_WIDTH-32);
    ensure(Math.min(58,29+content.length*14));
    draw(item.label+'  |  Page '+item.page,L+4,top,10.1,bold,teal);
    top-=19;
    for(const line of content){
      ensure(15);
      draw(line,L+16,top,9.8,regular,ink);
      top-=14;
    }
    top-=12;
  }
  heading('Your revision actions',tasks.length);
  if(!tasks.length)paragraph('No improvements have been requested yet.',{color:muted});
  let lastPriority=null;
  let actionNumber=0;
  for(const item of tasks){
    if(item.priority!==lastPriority){
      lastPriority=item.priority;
      ensure(48);
      const group=priorities[item.priority]||priorities.normal;
      page.drawRectangle({x:L,y:top-4,width:5,height:16,color:group.color});
      draw(group.label,L+13,top,10.2,bold,group.color);
      top-=27;
    }
    actionNumber++;
    const lines=wrap(item.text,regular,10.1,CONTENT_WIDTH-65);
    const label=String(actionNumber).padStart(2,'0')+'  /  '+item.label+'   |   Page '+item.page+'   |   '+item.topic;
    const labelRows=wrap(label,bold,9.4,CONTENT_WIDTH-67);
    // Never orphan the checkbox/identity without at least one line of action.
    ensure(Math.min(95,40+labelRows.length*13+Math.min(lines.length,2)*15));
    const boxX=L+5,boxY=top-10;
    page.drawRectangle({x:boxX,y:boxY-6,width:14,height:14,
      borderColor:teal,borderWidth:1.2,color:white});
    if(item.completed){
      page.drawLine({start:{x:boxX+3,y:boxY+1},end:{x:boxX+6,y:boxY-2},thickness:1.6,color:teal});
      page.drawLine({start:{x:boxX+6,y:boxY-2},end:{x:boxX+12,y:boxY+5},thickness:1.6,color:teal});
    }
    for(const labelRow of labelRows){
      ensure(17);
      draw(labelRow,L+30,top-2,9.4,bold,navy);
      top-=15;
    }
    top-=7;
    for(const line of lines){
      ensure(16);
      draw(line,L+30,top,10.1,regular,ink);
      top-=15;
    }
    // Reserve the reflection space as a unit. If an action used the end of
    // a page, repeat its identity so the student knows which response follows.
    if(top-80<BOTTOM){
      newPage();
      draw(item.label+'  |  Page '+item.page+'  (response continued)',L+30,top,9,bold,teal);
      top-=23;
    }
    ensure(65);
    draw('What I changed:',L+30,top-3,8.8,bold,muted);
    top-=16;
    page.drawLine({start:{x:L+30,y:top},end:{x:R-8,y:top},thickness:.55,color:border});
    top-=15;
    top-=13;
    ensure(12);
    page.drawLine({start:{x:L+30,y:top},end:{x:R-8,y:top},thickness:.55,color:border});
    top-=27;
    if(top>BOTTOM+7)page.drawLine({start:{x:L+30,y:top+10},end:{x:R-8,y:top+10},thickness:.35,color:border});
  }

  ensure(68);
  rule();
  paragraph('Check each action as you revise. Explain any change using your own mathematical reasoning. Ask your teacher if a request is unclear.',{
    size:9,color:muted,line:13,after:3,
  });
  const pageCount=pages.length;
  pages.forEach((p,index)=>{
    const footer='Draft feedback • student revision checklist';
    p.drawLine({start:{x:L,y:49},end:{x:R,y:49},thickness:.6,color:border});
    draw(footer,L,33,8.5,regular,muted,p);
    const number=(index+1)+' / '+pageCount;
    draw(number,R-bold.widthOfTextAtSize(number,9),33,9,bold,teal,p);
  });
  return {pagesAdded:pageCount,actionCount:tasks.length,strengthCount:strengths.length};
}
