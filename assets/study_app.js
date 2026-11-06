/* 스터디(papers.html): study/posts.json 을 런타임에 불러와 목록·읽기·글쓰기·수정·즐겨찾기를 처리한다. 평문 JSON, 암호화 없음.
   저장은 GitHub Contents API (토큰은 localStorage archive_gh_token). 토큰이 있을 때만 「수정」·별 토글이 보인다(삭제는 없음). 테스트에서는 localhost 에서만 archive_api_base 로 API 주소를 바꿀 수 있다. */
(function(){
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const REPO='inyoung09/archive',FPATH='study/posts.json',TOK_KEY='archive_gh_token';
const LOCAL=['localhost','127.0.0.1'].includes(location.hostname);
const API=(LOCAL&&localStorage.getItem('archive_api_base'))||'https://api.github.com';
const b2u=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const u2b=u=>{let s='';u.forEach(x=>s+=String.fromCharCode(x));return btoa(s);};
// ---------- safe markdown ----------
const safeUrl=u=>{u=String(u).trim();if(!u||/[\u0000- \u007f]/.test(u))return null;if(/^https?:\/\//i.test(u))return u;if(/^(\/\/|\\|[a-z][a-z0-9+.\-]*:)/i.test(u))return null;return u;};
// 이미지 src: 상대경로 study/img/..., https:, blob:, data:image/ 만 허용. IMG = 방금 올린 이미지의 경로 -> blob: URL (Pages 반영 전 미리보기용)
const IMG={};
const imgUrl=u=>{u=String(u).trim();if(!u)return null;if(/^study\/img\/[\w.\-]+$/.test(u))return IMG[u]||u;if(/^https:\/\/[^\s"'<>]+$/i.test(u)||/^blob:[^\s"'<>]+$/i.test(u)||/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+\/=]+$/i.test(u))return u;return null;};
function emph(t){
 return t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/(^|[\s(>])__(.+?)__(?=[\s).,!?:;<]|$)/g,'$1<strong>$2</strong>')
  .replace(/~~(.+?)~~/g,'<del>$1</del>').replace(/\*([^*\s][^*]*?)\*/g,'<em>$1</em>').replace(/(^|[\s(>])_([^_\s][^_]*?)_(?=[\s).,!?:;<]|$)/g,'$1<em>$2</em>');
}
function inline(t){ // t is already HTML-escaped
 const ph=[];const hold=h=>{ph.push(h);return '\u0000'+(ph.length-1)+'\u0000';};
 t=t.replace(/`([^`]+)`/g,(m,c)=>hold('<code>'+c+'</code>'));
 t=t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*?&quot;)?\)/g,(m,alt,u)=>{const s=imgUrl(u);return hold(s?'<a class="mdimg" href="'+s+'" target="_blank" rel="noopener noreferrer"><img src="'+s+'" alt="'+alt+'" loading="lazy" referrerpolicy="no-referrer"></a>':alt);});
 t=t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^)]*?&quot;)?\)/g,(m,l,u)=>{const s=safeUrl(u);return hold(s?'<a href="'+s+'" target="_blank" rel="noopener noreferrer">'+emph(l)+'</a>':emph(l));});
 t=t.replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g,(m,p,u)=>{const tail=(/[.,;:!?)]+$/.exec(u)||[''])[0];const core=u.slice(0,u.length-tail.length);return p+hold('<a href="'+core+'" target="_blank" rel="noopener noreferrer">'+core+'</a>')+tail;});
 t=emph(t);
 let g=0;while(/\u0000\d+\u0000/.test(t)&&g++<10)t=t.replace(/\u0000(\d+)\u0000/g,(m,i)=>ph[+i]);
 return t;
}
const BLOCK_START=l=>/^\s{0,3}(#{1,6}\s|>|(`{3,}|~{3,}))/.test(l)||/^\s*([-*+]|\d+[.)])\s+/.test(l)||/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l);
const SEP=/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells=l=>l.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>c.trim());
function listBlock(L,i){
 const re=/^(\s*)([-*+]|\d+[.)])\s+(.*)$/;const st=[];let out='';
 while(i<L.length){
  const m=re.exec(L[i]);
  if(!m){
   if(L[i].trim()&&/^\s+\S/.test(L[i])&&st.length){out+='<br>'+inline(esc(L[i].trim()));i++;continue;}
   if(!L[i].trim()&&i+1<L.length&&re.test(L[i+1])){i++;continue;}
   break;}
  const ind=m[1].replace(/\t/g,'    ').length,tag=/\d/.test(m[2][0])?'ol':'ul';
  while(st.length&&ind<st[st.length-1].ind)out+='</li></'+st.pop().tag+'>';
  const top=st[st.length-1];
  if(!top||ind>top.ind){out+='<'+tag+'><li>';st.push({ind,tag});}else out+='</li><li>';
  out+=inline(esc(m[3]));i++;
 }
 while(st.length)out+='</li></'+st.pop().tag+'>';
 return [out,i];
}
function blocks(L){
 let out='',i=0,m;
 while(i<L.length){
  const l=L[i];
  if(!l.trim()){i++;continue;}
  if(m=/^\s{0,3}(`{3,}|~{3,})\s*[\w+-]*\s*$/.exec(l)){
   const f=m[1],buf=[];i++;
   while(i<L.length&&!new RegExp('^\\s{0,3}'+(f[0]==='`'?'`':'~')+'{'+f.length+',}\\s*$').test(L[i]))buf.push(L[i++]);
   i++;out+='<pre><code>'+esc(buf.join('\n'))+'</code></pre>';continue;}
  if(m=/^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l)){const n=Math.min(m[1].length+2,6);out+='<h'+n+'>'+inline(esc(m[2]))+'</h'+n+'>';i++;continue;}
  if(/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)){out+='<hr>';i++;continue;}
  if(/^\s{0,3}>/.test(l)){const buf=[];while(i<L.length&&/^\s{0,3}>/.test(L[i]))buf.push(L[i++].replace(/^\s{0,3}>\s?/,''));out+='<blockquote>'+blocks(buf)+'</blockquote>';continue;}
  if(l.includes('|')&&i+1<L.length&&SEP.test(L[i+1])&&L[i+1].includes('-')){
   const head=cells(l);i+=2;let rows='';
   while(i<L.length&&L[i].trim()&&L[i].includes('|')){const c=cells(L[i++]);rows+='<tr>'+head.map((_,k)=>'<td>'+inline(esc(c[k]||''))+'</td>').join('')+'</tr>';}
   out+='<div class="tblw"><table><thead><tr>'+head.map(h=>'<th>'+inline(esc(h))+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>';continue;}
  if(/^\s*([-*+]|\d+[.)])\s+/.test(l)){const r=listBlock(L,i);out+=r[0];i=r[1];continue;}
  const buf=[l];i++;
  while(i<L.length&&L[i].trim()&&!BLOCK_START(L[i])&&!(L[i].includes('|')&&i+1<L.length&&SEP.test(L[i+1])))buf.push(L[i++]);
  out+='<p>'+buf.map(x=>inline(esc(x.trim()))).join('<br>')+'</p>';
 }
 return out;
}
const md=src=>blocks(String(src||'').replace(/\r\n?/g,'\n').split('\n'));

// ---------- helpers ----------
const todayKR=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
const newId=()=>'post-'+Date.now();
const getTok=()=>(localStorage.getItem(TOK_KEY)||'').trim();
const ghH=(tok,extra)=>Object.assign({'Accept':'application/vnd.github+json'},tok?{'Authorization':'Bearer '+tok}:{},extra||{});
let toastT;function toast(m,err){const t=$('#toast');t.textContent=m;t.className='toast show'+(err?' bad':'');clearTimeout(toastT);toastT=setTimeout(()=>t.className='toast',err?5000:3500);}
const plain=t=>String(t||'').replace(/```[\s\S]*?```/g,' ').replace(/^_\(이미지[^\n]*$/gm,'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/^[#>\-*+\s|:]+/gm,'').replace(/[*_`~]/g,'').split('\n').map(x=>x.trim()).filter(Boolean).slice(0,2).join(' · ');
const blurb=p=>{const t=p.kind==='paper'&&p.summary?p.summary:plain(p.body_md)||plain(p.summary);return t.length>150?t.slice(0,150)+'…':t;};
const driveUrl=u=>{const s=safeUrl(u);return s&&/^https:\/\/(drive|docs)\.google\.com\//i.test(s)?s:null;};
// ---------- state ----------
const CFG=JSON.parse($('#cfg').textContent);
const pf={posts:[],loaded:false,failed:false,theme:null,q:'',id:null,busy:false,editing:null};
const RM=matchMedia('(prefers-reduced-motion: reduce)');
const sortPosts=l=>[...l].sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||(b.updated||b.added||'').localeCompare(a.updated||a.added||'')||(a.title||'').localeCompare(b.title||'','ko'));
function groups(){
 const fb=CFG.fallback||'미분류',by={};
 pf.posts.forEach(p=>{const c=(p.category||'').trim()||fb;(by[c]=by[c]||[]).push(p);});
 const names=CFG.categories.map(c=>c.name).filter(n=>n!==fb);
 const order=names.concat(Object.keys(by).filter(n=>!names.includes(n)&&n!==fb)).concat([fb]);
 return order.filter(n=>by[n]).map(n=>{const c=CFG.categories.find(x=>x.name===n);return {name:n,desc:c?c.desc:'',list:sortPosts(by[n])};});
}
const catOf=p=>(p.category||'').trim()||CFG.fallback||'미분류';
// ---------- load ----------
function parsePosts(text){const d=JSON.parse(text);return Array.isArray(d)?d:(d.posts||[]);}
async function apiGetFile(){
 const tok=getTok();
 const r=await fetch(API+'/repos/'+REPO+'/contents/'+FPATH+'?ref=main&t='+Date.now(),{headers:ghH(tok),cache:'no-store'});
 if(r.status===404)return null;
 if(!r.ok)throw {status:r.status};
 const j=await r.json();let text;
 if(j.content)text=new TextDecoder().decode(b2u(j.content.replace(/\s/g,'')));
 else{const rr=await fetch(API+'/repos/'+REPO+'/contents/'+FPATH+'?ref=main&t='+Date.now(),{headers:ghH(tok,{'Accept':'application/vnd.github.raw+json'}),cache:'no-store'});if(!rr.ok)throw {status:rr.status};text=await rr.text();}
 return {sha:j.sha,text};
}
async function load(){
 let list=null;
 if(getTok()){try{const f=await apiGetFile();if(f)list=parsePosts(f.text);}catch(_){}}   // 토큰이 있으면 Pages 반영 전 최신본
 if(!list){
  try{const r=await fetch('study/posts.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw 0;list=parsePosts(await r.text());}
  catch(_){pf.failed=true;list=[];}
 }
 pf.posts=list;pf.loaded=true;
}
// ---------- save (read remote -> mutate -> PUT with sha, retry once on 409/422) ----------
function errText(e){
 if(e&&(e.status===401||e.status===403))return '토큰이 올바르지 않거나 권한이 없어요';
 return '저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
async function withRemote(mutate,msg){
 if(!getTok()){needToken();throw {handled:true};}
 for(let at=0;at<2;at++){
  const f=await apiGetFile();
  const remote=f?parsePosts(f.text):pf.posts.map(x=>x);   // 원격 파일이 아직 없으면 지금 보이는 목록에서 시작
  const merged=mutate(remote);
  const body={message:msg,content:u2b(new TextEncoder().encode(JSON.stringify({version:1,updated:todayKR(),posts:merged},null,2)+'\n')),branch:'main'};
  if(f)body.sha=f.sha;
  const r=await fetch(API+'/repos/'+REPO+'/contents/'+FPATH,{method:'PUT',headers:ghH(getTok(),{'Content-Type':'application/json'}),body:JSON.stringify(body)});
  if(r.ok)return merged;
  if((r.status===409||r.status===422)&&at===0)continue;
  throw {status:r.status};
 }
}
// ---------- need token ----------
function needToken(){
 const o=document.createElement('div');o.className='ovl';
 o.innerHTML='<div class="dlg" role="dialog" aria-modal="true" aria-label="토큰 필요"><h3>토큰이 필요해요</h3><p>글을 저장하려면 GitHub 토큰이 필요해요. 오른쪽 위 <b>⚙ 설정</b>에서 토큰을 붙여넣어 주세요. <a href="token-guide.html">토큰 만드는 방법</a></p><div class="row"><button type="button" class="btn sm" data-a="settings">⚙ 설정 열기</button><button type="button" class="btn ghost" data-a="close">닫기</button></div></div>';
 o.id='needtok';
 o.onclick=e=>{const b=e.target.closest('button');if(e.target===o||(b&&b.dataset.a==='close'))o.remove();else if(b&&b.dataset.a==='settings'){o.remove();window.archiveSettings&&window.archiveSettings.open('여기에 토큰을 붙여넣고 저장해 주세요.');}};
 document.body.appendChild(o);o.querySelector('button').focus();
}
// ---------- images ----------
const IMG_MAX=1600,IMG_WARN=10*1024*1024;
const pad2=n=>String(n).padStart(2,'0');
function imgName(ext){const d=new Date();return ''+d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate())+'-'+pad2(d.getHours())+pad2(d.getMinutes())+pad2(d.getSeconds())+'-'+Math.random().toString(36).slice(2,8)+'.'+ext;}
const toBlob=(cv,type,q)=>new Promise(r=>cv.toBlob(r,type,q));
async function shrinkImage(file){
 const bmp=await createImageBitmap(file);
 const k=Math.min(1,IMG_MAX/Math.max(bmp.width,bmp.height));
 const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(bmp.width*k));cv.height=Math.max(1,Math.round(bmp.height*k));
 cv.getContext('2d').drawImage(bmp,0,0,cv.width,cv.height);if(bmp.close)bmp.close();
 let b=await toBlob(cv,'image/webp',0.8),ext='webp';
 if(!b||b.type!=='image/webp'){b=await toBlob(cv,'image/jpeg',0.85);ext='jpg';}
 if(!b)throw new Error('encode');
 return {blob:b,ext};
}
const blobB64=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]);r.onerror=rej;r.readAsDataURL(b);});
async function putImage(name,blob){
 const body={message:'스터디 이미지 추가',content:await blobB64(blob),branch:'main'};
 const r=await fetch(API+'/repos/'+REPO+'/contents/study/img/'+name,{method:'PUT',headers:ghH(getTok(),{'Content-Type':'application/json'}),body:JSON.stringify(body)});
 if(!r.ok)throw {status:r.status};
}
function insertAtCursor(text){
 const ta=$('#e-body'),v=ta.value,a=ta.selectionStart==null?v.length:ta.selectionStart,b=ta.selectionEnd==null?a:ta.selectionEnd;
 const pre=a>0&&v[a-1]!=='\n'?'\n':'',post=v[b]===undefined||v[b]==='\n'?'':'\n';
 const ins=pre+text+post+(v[b]===undefined?'\n':'');
 ta.value=v.slice(0,a)+ins+v.slice(b);ta.selectionStart=ta.selectionEnd=a+ins.length;ta.focus();updPrev();
}
let upBusy=0;
async function addImages(files){
 files=[...files];if(!files.length)return;
 if(!getTok()){needToken();return;}
 const st=$('#e-imgst');
 for(const f of files){
  if(!/^image\/(png|jpe?g|gif|webp|bmp|avif)$/i.test(f.type)){toast('이미지 파일만 올릴 수 있어요.',true);continue;}
  upBusy++;$('#e-img').disabled=true;
  st.textContent=(f.size>IMG_WARN?'큰 이미지(10MB 초과)라 줄여서 올려요 · ':'')+'이미지 올리는 중…';
  try{
   const {blob,ext}=await shrinkImage(f),name=imgName(ext);
   await putImage(name,blob);
   const path='study/img/'+name;IMG[path]=URL.createObjectURL(blob);
   insertAtCursor('![]('+path+')');toast('이미지를 올렸어요 (사이트에는 약 1분 뒤 반영돼요)');
  }catch(e){toast(e&&e.status?errText(e):'이미지를 처리하지 못했어요. 다른 파일로 시도해 주세요.',true);}
  upBusy--;
 }
 if(!upBusy){st.textContent='';$('#e-img').disabled=false;}
}
// ---------- rendering ----------
const tagsH=t=>(t||[]).map(x=>'<span class="tag">#'+esc(x)+'</span>').join('');
const byLine=p=>[p.author,p.kind==='paper'&&p.year?String(p.year):''].filter(Boolean).join(' | ');
const KIND={paper:'자료',note:'메모',post:'글'};
function l1(){
 const gs=groups();
 if(!pf.posts.length)return '<div class="top1"><h1 class="mega">스터디</h1></div><div class="empty">'+(pf.failed?'글 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.':'아직 담긴 자료가 없어요. ‘글쓰기’로 시작해 보세요.')+'</div><p style="text-align:center"><button type="button" class="btn" id="wbtn0">글쓰기</button></p>';
 return '<div id="lv1" class="lv1"><h1 class="mega">스터디</h1><div class="strips">'+gs.map((g,i)=>'<button type="button" class="strip s'+(i%9)+'" data-theme="'+esc(g.name)+'" style="z-index:'+(i+1)+'"><span class="st">'+esc(g.name)+'</span><span class="sd">'+esc(g.desc)+'</span><span class="sn">'+String(g.list.length).padStart(3,'0')+'</span><span class="sa" aria-hidden="true">↗</span></button>').join('')+'</div></div>';
}
function l2(){
 const gs=groups();
 const items=gs.flatMap(g=>g.list.map(p=>{
  const text=[p.title,p.author,p.summary,(p.tags||[]).join(' '),p.body_md].join(' ').toLowerCase();
  const sm=blurb(p);
  const star=p.pinned
    ?(getTok()?'<button type="button" class="pin on" data-act="pin" title="즐겨찾기 해제" aria-label="즐겨찾기 해제" aria-pressed="true">★</button>':'<span class="pin on" title="즐겨찾기" aria-label="즐겨찾기">★</span>')
    :(getTok()?'<button type="button" class="pin" data-act="pin" title="즐겨찾기" aria-label="즐겨찾기" aria-pressed="false">☆</button>':'');
  return '<article class="item" data-id="'+esc(p.id)+'" data-cat="'+esc(g.name)+'" data-text="'+esc(text)+'"><div class="ih"><h3 tabindex="0" role="link">'+esc(p.title)+(p.sample?' <span class="badge">예시</span>':'')+'<span class="kind">'+(KIND[p.kind]||'글')+'</span></h3>'+star+'</div>'
   +(sm?'<p class="sum">'+esc(sm)+'</p>':'')+'<div class="imeta">'+(byLine(p)?'<span class="by">'+esc(byLine(p))+'</span>':'<span></span>')+((p.tags||[]).length?'<span class="tags">'+tagsH(p.tags)+'</span>':'')+'</div>'
   +(getTok()?'<div class="acts"><button type="button" data-act="edit">수정</button></div>':'')+'</article>';}));
 return '<div id="lv2" class="lv2" hidden><div class="l2top"><button type="button" class="back" id="pback">← 테마</button><input type="search" id="pq" placeholder="제목·저자·요약·태그 검색" aria-label="검색"><button type="button" class="btn sm wbtn" id="wbtn">글쓰기</button></div>'
  +'<div class="tabbar" id="ptabs" role="tablist"><button type="button" class="tab on" data-theme="">전체</button>'+gs.map(g=>'<button type="button" class="tab" data-theme="'+esc(g.name)+'">'+esc(g.name)+'</button>').join('')+'</div>'
  +'<p class="pcount" id="pcount"></p><div class="items" id="plist">'+items.join('')+'</div><div class="none" id="pnone">검색 결과가 없어요.</div></div>';
}
function pdfBlock(p){
 const files=(p.drive_files||[]).map(f=>({name:f.name||'PDF',url:driveUrl(f.url)})).filter(f=>f.url);
 if(files.length)return '<p class="by">원문 PDF (Google Drive · 인영 계정으로만 열려요)</p><ul class="pdfs">'+files.map(f=>'<li><a href="'+esc(f.url)+'" target="_blank" rel="noopener noreferrer">'+esc(f.name)+'</a></li>').join('')+'</ul>';
 const u=driveUrl(p.drive_url);
 return u?'<p><a class="pdfl" href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">원문 PDF 보기</a></p>':'';
}
function reader(p){
 const body=(p.body_md||'').trim();
 const lead=p.summary&&!body?'<p class="lead">'+esc(p.summary)+'</p>':'';
 const pinBtn=p.pinned
  ?(getTok()?'<button type="button" class="pin on" data-act="pin" data-id="'+esc(p.id)+'" title="즐겨찾기 해제" aria-label="즐겨찾기 해제" aria-pressed="true">★</button>':'<span class="pin on" title="즐겨찾기" aria-label="즐겨찾기">★</span>')
  :(getTok()?'<button type="button" class="pin" data-act="pin" data-id="'+esc(p.id)+'" title="즐겨찾기" aria-label="즐겨찾기" aria-pressed="false">☆</button>':'');
 return '<div class="reader"><div class="racts"><button type="button" class="back" id="rback">← 목록</button>'+pinBtn+(getTok()?'<button type="button" data-act="edit" data-id="'+esc(p.id)+'">수정</button>':'')+'</div>'
  +'<div class="by">'+esc(catOf(p))+'<span class="kind">'+(KIND[p.kind]||'글')+'</span>'+(p.sample?' <span class="badge">예시</span>':'')+'</div>'
  +'<h1>'+esc(p.title)+'</h1><div class="by">'+esc([byLine(p),p.updated?'마지막 수정 '+p.updated:''].filter(Boolean).join(' · '))+'</div>'
  +'<div>'+tagsH(p.tags)+'</div>'+lead+pdfBlock(p)
  +(body?'<div class="md">'+md(body)+'</div>':'')+'</div>';
}
function editorHtml(p){
 const cats=[...new Set(CFG.categories.map(c=>c.name).concat(pf.posts.map(catOf)))];
 return '<div class="editor" id="editor"><h2>'+(p?'글 수정':'글쓰기')+'</h2>'
  +'<input type="text" id="e-title" placeholder="제목" aria-label="제목" maxlength="200" value="'+esc(p?p.title:'')+'">'
  +'<div class="erow"><input type="text" id="e-cat" list="e-cats" placeholder="분류 (목록에서 고르거나 새로 입력)" aria-label="분류" value="'+esc(p?catOf(p):'')+'" autocomplete="off"><datalist id="e-cats">'+cats.map(c=>'<option value="'+esc(c)+'">').join('')+'</datalist>'
  +'<input type="text" id="e-tags" placeholder="태그 (쉼표로 구분)" aria-label="태그" value="'+esc(p?(p.tags||[]).join(', '):'')+'"></div>'
  +'<input type="url" id="e-drive" placeholder="관련 링크 (Google Drive 등, 선택)" aria-label="관련 링크" value="'+esc(p&&p.drive_url?p.drive_url:'')+'">'
  +'<div class="row"><button class="btn sm ghost" id="e-img" type="button">🖼 이미지 추가</button><input type="file" id="e-file" accept="image/*" multiple hidden><span class="imgst" id="e-imgst" role="status" aria-live="polite"></span><span class="imgst">붙여넣기·끌어다 놓기도 돼요</span></div>'
  +'<div class="panes"><textarea id="e-body" placeholder="본문 (마크다운)" aria-label="본문"></textarea><div class="pane-prev md" id="e-prev" aria-label="미리보기"></div></div>'
  +'<div class="err" id="e-err" role="alert"></div>'
  +'<div class="row"><button class="btn" id="e-save" type="button">저장</button><button class="btn ghost" id="e-cancel" type="button">취소</button></div></div>';
}
function updPrev(){const b=$('#e-body'),p=$('#e-prev');if(b&&p)p.innerHTML=md(b.value);}
// ---------- navigation ----------
function route(){
 const h=location.hash;
 let m=/^#id=(.*)$/.exec(h);
 pf.id=m?decodeURIComponent(m[1]):null;
 m=/^#theme=(.*)$/.exec(h);
 pf.theme=m?decodeURIComponent(m[1]):null;
 if(pf.id){pf.last=pf.last||null;}
 render();
}
function setHash(h){if(h===location.hash||(!h&&!location.hash)){route();return;}if(h)location.hash=h;else{history.pushState(null,'',location.pathname+location.search);route();}}
const hashTheme=t=>t===null?'':'#theme='+encodeURIComponent(t);
function fit(){document.querySelectorAll('#lv1 .st').forEach(t=>{t.style.fontSize='';if(!t.clientWidth)return;
 let f=parseFloat(getComputedStyle(t).fontSize);while(t.scrollWidth>t.clientWidth&&f>22){f-=1;t.style.fontSize=f+'px';}});}
function reveal(){const ss=[...document.querySelectorAll('#lv1 .strip')];if(RM.matches||!window.IntersectionObserver)return;
 ss.forEach(x=>x.classList.add('pre'));let k=0;
 const io=new IntersectionObserver(es=>es.forEach(en=>{if(!en.isIntersecting)return;io.unobserve(en.target);const x=en.target;
  x.style.transitionDelay=Math.min(k++,6)*70+'ms';x.classList.remove('pre');setTimeout(()=>{x.style.transitionDelay='';},1300);}),{threshold:.18});
 ss.forEach(x=>io.observe(x));}
let built=false;
function buildLists(){
 $('#content').innerHTML=l1()+(pf.posts.length?l2():'')+'<div id="rd" hidden></div><div id="ed" hidden></div>';
 built=true;pf.shown=undefined;
 if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);
 reveal();
}
function render(){
 if(!pf.loaded)return;
 if(!built)buildLists();
 const root=$('#content'),lv1=root.querySelector('#lv1'),lv2=root.querySelector('#lv2'),rd=$('#rd'),ed=$('#ed');
 if(!rd)return;
 const showReader=pf.id!==null;
 if(pf.editing){if(lv1)lv1.hidden=true;if(lv2)lv2.hidden=true;rd.hidden=true;ed.hidden=false;return;}
 ed.hidden=true;ed.innerHTML='';
 if(showReader){
  const p=pf.posts.find(x=>x.id===pf.id);
  if(p){if(lv1)lv1.hidden=true;if(lv2)lv2.hidden=true;rd.innerHTML=reader(p);rd.hidden=false;scrollTo(0,0);return;}
  pf.id=null;
 }
 rd.hidden=true;rd.innerHTML='';
 if(!lv1)return;
 const t=pf.theme;
 if(t!==null&&!root.querySelector('.tab[data-theme="'+CSS.escape(t)+'"]'))pf.theme=null;
 const th=pf.theme;
 lv1.hidden=th!==null;lv2.hidden=th===null;
 if(th===null){pf.shown=null;const sp=root.querySelector('.strips');sp.classList.remove('leaving');sp.querySelectorAll('.pick').forEach(x=>x.classList.remove('pick'));pf.busy=false;fit();return;}
 const anim=th!==pf.shown;pf.shown=th;
 let n=0;
 root.querySelectorAll('.item').forEach(c=>{const ok=(!th||c.dataset.cat===th)&&(!pf.q||c.dataset.text.includes(pf.q));c.hidden=!ok;if(ok)n++;});
 root.querySelectorAll('#ptabs .tab').forEach(b=>{const on=b.dataset.theme===th;b.classList.toggle('on',on);if(on)b.scrollIntoView({block:'nearest',inline:'nearest'});});
 if(anim){let k=0;root.querySelectorAll('.item').forEach(c=>{c.classList.remove('in');c.style.animationDelay='';
  if(!c.hidden&&!RM.matches){void c.offsetWidth;c.style.animationDelay=Math.min(k++,8)*40+'ms';c.classList.add('in');}});}
 $('#pcount').textContent=n+'개의 자료가 있습니다';
 $('#pnone').style.display=n?'none':'block';
}
function refresh(){built=false;render();}
// ---------- actions ----------
function openWrite(p){
 if(!getTok()){needToken();return;}
 pf.editing=p||{};
 const ed=$('#ed');ed.innerHTML=editorHtml(p);
 // 본문이 비어 있으면(논문 요약만 있는 경우) 요약으로 채워 수정할 수 있게
 $('#e-body').value=p?(p.body_md||p.summary||''):'';
 updPrev();render();scrollTo(0,0);$('#e-title').focus();
}
function closeEdit(){pf.editing=null;render();}
async function saveEdit(){
 const title=$('#e-title').value.trim();
 if(!title){$('#e-err').textContent='제목을 입력해 주세요.';return;}
 const cat=$('#e-cat').value.trim();
 if(!cat){$('#e-err').textContent='분류를 입력하거나 골라 주세요.';return;}
 const tags=[...new Set($('#e-tags').value.split(/[,，]/).map(t=>t.trim().replace(/^#/,'')).filter(Boolean))];
 const body=$('#e-body').value,drive=($('#e-drive')&&$('#e-drive').value||'').trim(),now=todayKR(),old=pf.editing&&pf.editing.id?pf.editing:null;
 const sum=plain(body).slice(0,200)||(old&&old.summary)||'';
 const p=old?Object.assign({},old,{title,category:cat,tags,body_md:body,summary:sum,drive_url:drive,updated:now,editable:true})
  :{id:newId(),kind:'post',title,category:cat,tags,summary:sum,body_md:body,author:'',year:'',added:now,updated:now,drive_url:drive,drive_files:[],sample:false,editable:true,pinned:false,source:'study-app'};
 const btn=$('#e-save');btn.disabled=true;
 try{
  const merged=await withRemote(rem=>{const i=rem.findIndex(x=>x.id===p.id);if(i>=0)rem[i]=p;else rem.push(p);return rem;},'스터디 저장: '+p.id);
  pf.posts=merged;pf.editing=null;toast('저장됐어요 (사이트에는 약 1분 뒤 반영돼요)');
  refresh();
  pf.theme=null;setHash('#id='+encodeURIComponent(p.id));
 }catch(e){if(!(e&&e.handled))toast(errText(e),true);}
 const b2=$('#e-save');if(b2)b2.disabled=false;
}
async function togglePin(id){
 if(!getTok()){needToken();return;}
 const p=pf.posts.find(x=>x.id===id);if(!p)return;
 const next=!p.pinned;
 try{
  pf.posts=await withRemote(rem=>{const i=rem.findIndex(x=>x.id===id);if(i>=0)rem[i]=Object.assign({},rem[i],{pinned:next,updated:todayKR()});return rem;},'스터디 즐겨찾기: '+id);
  toast(next?'즐겨찾기에 넣었어요':'즐겨찾기를 해제했어요');
  refresh();
 }catch(e){if(!(e&&e.handled))toast(errText(e),true);}
}
const root=$('#content');
root.onclick=e=>{
 const act=e.target.closest('[data-act]');
 if(act){
  const it=act.closest('.item'),id=act.dataset.id||(it&&it.dataset.id),p=pf.posts.find(x=>x.id===id);
  if(act.dataset.act==='edit'&&p)openWrite(p);
  else if(act.dataset.act==='pin')togglePin(id);
  return;}
 if(e.target.closest('#wbtn,#wbtn0')){openWrite(null);return;}
 const s=e.target.closest('.strip,.tab');
 if(s){
  if(s.classList.contains('strip')&&!RM.matches){if(pf.busy)return;pf.busy=true;s.classList.add('pick');s.parentNode.classList.add('leaving');
   setTimeout(()=>{setHash(hashTheme(s.dataset.theme));scrollTo(0,0);},220);return;}
  setHash(hashTheme(s.dataset.theme));scrollTo(0,0);return;}
 if(e.target.closest('#pback')){setHash('');scrollTo(0,0);return;}
 if(e.target.closest('#rback')){setHash(pf.theme!==null?hashTheme(pf.theme):(pf.lastTheme!=null?hashTheme(pf.lastTheme):''));return;}
 if(e.target.closest('#e-save')){saveEdit();return;}
 if(e.target.closest('#e-cancel')){closeEdit();return;}
 if(e.target.closest('#e-img')){$('#e-file').click();return;}
 const h3=e.target.closest('.item h3');
 if(h3){pf.lastTheme=pf.theme;setHash('#id='+encodeURIComponent(h3.closest('.item').dataset.id));}
};
root.onkeydown=e=>{if((e.key==='Enter')&&e.target.matches('.item h3'))e.target.click();};
root.oninput=e=>{
 if(e.target.id==='pq'){pf.q=e.target.value.trim().toLowerCase();render();}
 else if(e.target.id==='e-body')updPrev();};
root.onchange=e=>{if(e.target.id==='e-file'){const f=[...e.target.files];e.target.value='';addImages(f);}};
root.addEventListener('paste',e=>{if(e.target.id!=='e-body')return;const f=[...(e.clipboardData?e.clipboardData.files:[])].filter(x=>x.type.startsWith('image/'));if(f.length){e.preventDefault();addImages(f);}});
root.addEventListener('dragover',e=>{if(e.target.id==='e-body'&&e.dataTransfer&&[...e.dataTransfer.types].includes('Files'))e.preventDefault();});
root.addEventListener('drop',e=>{if(e.target.id!=='e-body')return;const f=e.dataTransfer?[...e.dataTransfer.files]:[];if(f.length){e.preventDefault();addImages(f);}});
window.addEventListener('hashchange',()=>{if(pf.editing&&!confirmLeave())return;pf.editing=null;route();});
function confirmLeave(){return true;}
let rt;window.onresize=()=>{clearTimeout(rt);rt=setTimeout(fit,120);};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const o=$('#needtok');if(o)o.remove();}});
document.addEventListener('archive-token',()=>{if(pf.loaded)refresh();});
(async()=>{await load();buildLists();route();})();
})();
