import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const origin='https://marking.mrwalkermaths.com/';
const root=new URL(origin);
const sha=text=>createHash('sha256').update(text).digest('hex');
const paths=[
  'index.html','library.html','library.html?mode=feedback',
  'styles.css','design-polish.css','workspace.css','fast-stamp.css',
  'review-polish.css','compact-stamps.css','library.css',
  'app.js','library.js','comments.js','feedback-comments.js','rubric.js',
  'fast-stamp.js','vendor/pdf.mjs','vendor/pdf.worker.mjs',
  'vendor/pdf-lib.min.js','vendor/fontkit.umd.min.js','vendor/jszip.min.js',
  'vendor/fonts/NotoSans-Regular.ttf','vendor/fonts/NotoSans-Bold.ttf',
  'vendor/fonts/NotoSansMath-Regular.ttf'
];
const responses=await Promise.all(paths.map(async path=>{
  const url=new URL(path,root);
  const r=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(35000)});
  const bytes=Buffer.from(await r.arrayBuffer());
  const mime=r.headers.get('content-type')||'';
  const row={path,status:r.status,finalUrl:r.url,bytes:bytes.length,mime};
  if(r.status!==200)throw Error('Unserved custom-domain resource: '+JSON.stringify(row));
  if(new URL(r.url).origin!==root.origin)throw Error('Resource redirected away from custom domain: '+JSON.stringify(row));
  if(!path.includes('?')&&!path.endsWith('index.html')&&!path.endsWith('library.html')&&bytes.length<100)
    throw Error('Asset is unexpectedly small: '+JSON.stringify(row));
  if(/\.(?:js|mjs|css|ttf)$/.test(path)&&mime.includes('text/html'))
    throw Error('Static asset is an HTML error page: '+JSON.stringify(row));
  if(['index.html','library.html','app.js','library.js','styles.css'].includes(path)){
    const local=readFileSync(new URL('../'+path,import.meta.url));
    if(!bytes.equals(local))throw Error('Published file differs from main-branch source: '+path+' '+sha(bytes)+' != '+sha(local));
    row.repositoryMatch=true;
  }
  console.log('LIVE_ASSET='+JSON.stringify(row));
  return {path,bytes};
}));
const html=responses.find(x=>x.path==='index.html').bytes.toString('utf8');
const lib=responses.find(x=>x.path==='library.html').bytes.toString('utf8');
if(!html.includes('IA Marking Desk')||!html.includes('Import backup')||!html.includes('Back up IA')
  ||!html.includes("default-src 'self'"))throw Error('Unexpected IA Marking application HTML');
if(!lib.includes('Full stamp comment library')||!lib.includes('feedback-comments.js'))
  throw Error('Standalone library missing');
const old=await fetch('https://chriswalker-afk.github.io/IA-Marking/index.html',{
  redirect:'follow',signal:AbortSignal.timeout(25000)
});
if(!old.ok)throw Error('Legacy project URL is unavailable: '+old.status);
const oldHTML=await old.text();
if(!oldHTML.includes('IA Marking Desk'))throw Error('Legacy address no longer serves the marking desk');
console.log('LIVE_DOMAIN_RESULT='+JSON.stringify({
  origin,assetsChecked:responses.length,https:true,
  indexSHA256:sha(responses[0].bytes),libraryWorks:true,
  selfHostedPdfWorker:true,embeddedUnicodeFonts:true,
  oldAddress:{status:old.status,finalUrl:old.url},
  status:'PASS'
}));