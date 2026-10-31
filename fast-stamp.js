/**
 * Query ranking for both IA comment banks.
 * This module contains no student data, browser storage or PDF state.
 * Tokens can match across topic, criterion, tags and comment wording.
 */
const normalise = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().trim();

export function rankStampComments(items, query, {favorites=[],recent=[]}={}) {
  const terms=normalise(query).split(/\s+/u).filter(Boolean);
  if(!terms.length)return [...items];
  const exact=terms.join(' ');
  const favouriteIds=new Set(favorites);
  const recency=new Map(recent.map((id,index)=>[id,index]));
  return items.map((item,index)=>{
    const topic=normalise(item.topic),criterion=normalise(item.criterion);
    const text=normalise(item.text),tags=normalise((item.tags||[]).join(' '));
    const joined=[criterion,topic,tags,text].join(' ');
    if(!terms.every(term=>joined.includes(term)))return null;
    let score=0;
    for(const term of terms) {
      if(topic.includes(term))score+=32;
      if(tags.includes(term))score+=19;
      if(criterion===term)score+=24;
      if(text.includes(term))score+=6;
    }
    if(topic.includes(exact))score+=35;
    if(text.includes(exact))score+=22;
    if(text.startsWith(exact))score+=10;
    if(favouriteIds.has(item.id))score+=9;
    if(recency.has(item.id))score+=Math.max(1,7-recency.get(item.id));
    return {item,index,score};
  }).filter(Boolean).sort((a,b)=>b.score-a.score||a.index-b.index).map(row=>row.item);
}

/** Select a result without wrapping into empty space. */
export function clampResultIndex(value,count) {
  if(!Number.isFinite(count)||count<=0)return -1;
  const n=Number.isFinite(value)?Math.trunc(value):0;
  return ((n%count)+count)%count;
}

/** Summarises the computed placement without promising to avoid PDF maths. */
export function placementFeedback({requested,resolved,overlaps=false,fits=true,contentFits=true}) {
  if(!fits||!contentFits)return {kind:'warning',text:'This comment needs a larger box or shorter wording.'};
  if(overlaps)return {kind:'warning',text:'No gap between existing comments was found. Try another location.'};
  if(!requested||!resolved)return {kind:'ready',text:'Click to place beside the relevant work.'};
  const gap=Math.hypot((resolved.x-requested.x)||0,(resolved.y-requested.y)||0);
  return gap>5
    ?{kind:'adjusted',text:'The stamp will shift to stay within the page and clear of other comments.'}
    :{kind:'ready',text:'The stamp will be placed here. Check it does not cover mathematics.'};
}
