const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const state = { sources: [], isBusy: false, questionCount: 0, chatHistory: [] };
const API_BASE = location.protocol === 'file:' ? 'http://127.0.0.1:8773' : location.origin;
const MODEL_KEY = 'toxic.localModel';
let selectedModel = localStorage.getItem(MODEL_KEY) || 'llama3.2:3b';
const VISION_MODEL_KEY='toxic.visionModel';let selectedVisionModel=localStorage.getItem(VISION_MODEL_KEY)||'';let availableModels=[];
const PREFS_KEY = 'toxic.answerPreferences';
const SEARCH_HISTORY_KEY = 'toxic.searchHistory';
const defaultPreferences = {detail:'concise',audience:'beginner',format:'automatic',language:'English',tone:'clear',reasoning:'balanced',defineTerms:false,instructions:'',saveSearchHistory:false};
let answerPreferences = loadAnswerPreferences();
let localAiReady = false;
const fileInput = $('#fileInput'), attachBtn = $('#attachBtn'), input = $('#questionInput'), messages = $('#messages'), welcome = $('#welcome');
const scriptLoads = new Map();
function loadScript(url, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!scriptLoads.has(url)) scriptLoads.set(url, new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = url; script.async = true;
    script.onload = () => window[globalName] ? resolve(window[globalName]) : reject(new Error(`${globalName} did not load`));
    script.onerror = () => { scriptLoads.delete(url); reject(new Error(`Could not load ${globalName}. Check your internet connection and try again.`)); };
    document.head.appendChild(script);
  }));
  return scriptLoads.get(url);
}
function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 3000); }
function loadAnswerPreferences(){try{return {...defaultPreferences,...JSON.parse(localStorage.getItem(PREFS_KEY)||'{}')};}catch{return {...defaultPreferences};}}
function loadSavedSearchHistory(){if(!answerPreferences.saveSearchHistory)return [];try{const saved=JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY)||'[]');return Array.isArray(saved)?saved.filter(item=>typeof item==='string').slice(0,12):[];}catch{return [];}}
let searchHistory=loadSavedSearchHistory();
function renderSearchHistory(){const list=$('#searchHistoryList'),label=$('#searchHistoryLabel');if(!list||!label)return;const enabled=!!answerPreferences.saveSearchHistory;label.hidden=!enabled;list.replaceChildren();if(!enabled)return;if(!searchHistory.length){list.innerHTML='<div class="search-history-empty">No saved questions yet</div>';return;}list.innerHTML=searchHistory.map((question,index)=>`<button type="button" class="search-history-item" data-history-index="${index}" title="${esc(question)}">${esc(question)}</button>`).join('');}
function recordSearch(question){if(!answerPreferences.saveSearchHistory)return;const query=question.trim().replace(/\s+/g,' ').slice(0,2000);if(!query)return;searchHistory=[query,...searchHistory.filter(item=>item.toLocaleLowerCase()!==query.toLocaleLowerCase())].slice(0,12);try{localStorage.setItem(SEARCH_HISTORY_KEY,JSON.stringify(searchHistory));}catch{toast('The browser could not save search history.');}renderSearchHistory();}
function clearSavedSearchHistory(){searchHistory=[];try{localStorage.removeItem(SEARCH_HISTORY_KEY);}catch{}renderSearchHistory();toast('Saved search history cleared.');}
function populatePreferenceForm(){for(const [key,id]of Object.entries({detail:'answerDetail',audience:'answerAudience',format:'answerFormat',language:'answerLanguage',tone:'answerTone',reasoning:'reasoningEffort',instructions:'answerInstructions'})){$('#'+id).value=answerPreferences[key]||defaultPreferences[key];}$('#defineTerms').checked=!!answerPreferences.defineTerms;$('#saveSearchHistory').checked=!!answerPreferences.saveSearchHistory;}
function saveAnswerPreferences(){answerPreferences={detail:$('#answerDetail').value,audience:$('#answerAudience').value,format:$('#answerFormat').value,language:$('#answerLanguage').value.trim().slice(0,40)||'English',tone:$('#answerTone').value,reasoning:$('#reasoningEffort').value,defineTerms:$('#defineTerms').checked,instructions:$('#answerInstructions').value.trim().slice(0,500),saveSearchHistory:$('#saveSearchHistory').checked};localStorage.setItem(PREFS_KEY,JSON.stringify(answerPreferences));if(!answerPreferences.saveSearchHistory){searchHistory=[];try{localStorage.removeItem(SEARCH_HISTORY_KEY);}catch{}}renderSearchHistory();selectedVisionModel=$('#visionModelName').value.trim().slice(0,100);localStorage.setItem(VISION_MODEL_KEY,selectedVisionModel);}
function activeVisionModel(){const visionPattern=/(qwen.*(vl|vision)|llava|bakllava|minicpm-v|gemma3|moondream|llama.*vision)/i;return availableModels.find(name=>name===selectedVisionModel||name.startsWith(`${selectedVisionModel}:`))||availableModels.find(name=>name===selectedModel&&visionPattern.test(name))||availableModels.find(name=>visionPattern.test(name))||'';}
function setModelStatus(ready, label) { localAiReady=ready;const badge=$('#modelStatus');badge.innerHTML=`<i></i> ${esc(label)}`;badge.classList.toggle('model-ready',ready);badge.classList.toggle('model-offline',!ready); }
async function refreshModelStatus() {
  setModelStatus(false,'CHECKING LOCAL AI');
  try {
    const response=await fetch(`${API_BASE}/api/models`);const data=await response.json();if(!response.ok)throw new Error(data.error||'Local AI server is unavailable.');
    const models=(data.models||[]).map(m=>m.name).filter(Boolean);availableModels=models;const found=models.find(name=>name===selectedModel||name.startsWith(`${selectedModel}:`));
    const visionMatch=models.find(name=>/^qwen2\.5vl:7b$/i.test(name))||models.find(name=>name===selectedModel&&/(qwen.*(vl|vision)|llava|bakllava|minicpm-v|gemma3|moondream|llama.*vision)/i.test(name))||models.find(name=>/(qwen.*(vl|vision)|llava|bakllava|minicpm-v|gemma3|moondream|llama.*vision)/i.test(name));if(!selectedVisionModel&&visionMatch)selectedVisionModel=visionMatch;$('#visionModelName').value=selectedVisionModel;
    $('#visionHelp').textContent=activeVisionModel()?`Image model ready: ${activeVisionModel()}.`:'No vision-capable model found. Install an Ollama model that accepts images to read diagrams.';
    if(found){selectedModel=found;localStorage.setItem(MODEL_KEY,found);$('#modelName').value=found;$('#modelHelp').textContent=`Connected to ${found}. Answers will be generated locally.`;setModelStatus(true,'LOCAL AI READY');}
    else {$('#modelName').value=selectedModel;$('#modelHelp').textContent=models.length?`Model “${selectedModel}” is not installed. Available: ${models.join(', ')}. Choose one above or install ${selectedModel}.`:'Ollama is running, but no models are installed. In a terminal, run: ollama pull '+selectedModel;setModelStatus(false,'LOCAL AI MODEL NEEDED');}
  } catch(error) {$('#modelName').value=selectedModel;$('#modelHelp').textContent='Generated answers need Ollama running locally. Install it from ollama.com, then run: ollama pull '+selectedModel+'. Evidence-only answers remain available.';setModelStatus(false,'EVIDENCE MODE');}
}
function esc(s='') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function formatBytes(n) { return n < 1024*1024 ? `${Math.max(1,Math.round(n/1024))} KB` : `${(n/1024/1024).toFixed(1)} MB`; }
function fileKind(file) { const n=file.name.toLowerCase(); if(n.endsWith('.pdf'))return'PDF';if(n.endsWith('.csv')||n.endsWith('.tsv')||n.endsWith('.xls')||n.endsWith('.xlsx'))return'TABLE';if(n.endsWith('.json'))return'JSON';if(n.endsWith('.docx'))return'DOCX';if(/\.(png|jpe?g|webp|tiff?)$/.test(n))return'IMAGE';return'TEXT'; }
let lastMapQuestion='';let lastMapResult=null;let selectedMapSource='';
function renderEvidenceMap(result){if(result){lastMapResult=result;}const graphic=$('#mapGraphic'),nodes=$('#mapNodes'),edges=$('#mapEdges');if(!graphic||!nodes||!edges)return;const sources=state.sources.slice(0,8);if(selectedMapSource&&!state.sources.some(source=>source.id===selectedMapSource))selectedMapSource='';const active=new Set((lastMapResult?.evidence||[]).map(item=>item.source?.id).filter(Boolean));const total=state.sources.length;const cx=50,cy=50,rx=41,ry=39;const positions=sources.map((source,index)=>{const angle=(-Math.PI/2)+(2*Math.PI*index/Math.max(1,sources.length));return{x:cx+Math.cos(angle)*rx,y:cy+Math.sin(angle)*ry,source};});nodes.innerHTML=positions.map(({x,y,source},index)=>{const icon=source.kind==='IMAGE'?'▧':source.kind==='PDF'?'▤':source.kind==='TABLE'?'▦':'≡';const status=source.status==='Reading…'?'reading':source.status==='Could not read'?'error':active.has(source.id)?'cited':'ready';return`<button type="button" class="map-node map-source-node ${status} ${selectedMapSource===source.id?'selected':''}" data-map-source="${esc(source.id)}" style="--node-x:${x}%;--node-y:${y}%" title="${esc(source.name)} · ${esc(source.kind)}" aria-label="Show evidence from ${esc(source.name)}">${icon}<span class="map-node-label">${esc(source.name.length>14?source.name.slice(0,12)+'…':source.name)}</span></button>`;}).join('')+(total>8?`<span class="map-overflow">+${total-8} more</span>`:'');edges.innerHTML=positions.map(({x,y,source})=>`<line class="map-edge ${active.has(source.id)?'cited':''}" x1="50" y1="50" x2="${x}" y2="${y}"/>`).join('');graphic.classList.toggle('has-sources',total>0);const passageCount=state.sources.reduce((n,source)=>n+source.chunks.length,0);$('#mapSourceCount').textContent=`${total} source${total===1?'':'s'} connected`;$('#mapClaimCount').textContent=lastMapQuestion?`${active.size} source${active.size===1?'':'s'} cited for latest answer`:total?`${passageCount} evidence passages · click a source`:'Waiting for evidence';if(!total){$('#mapSelectionTitle').textContent='No evidence loaded yet';$('#mapSelectionText').textContent='Upload a document or image to create your map.';}else if(selectedMapSource){showMapSource(selectedMapSource);}}
function showMapSource(id){const source=state.sources.find(item=>item.id===id);if(!source)return;selectedMapSource=id;const title=$('#mapSelectionTitle'),text=$('#mapSelectionText');if(!title||!text)return;title.textContent=source.name;text.textContent=`${source.kind} · ${source.status||'Ready'} · ${source.chunks.length} passages${source.pages?` · ${source.pages} pages`:''}`;const evidence=(lastMapResult?.evidence||[]).filter(item=>item.source?.id===id||item.source?.name===source.name).slice(0,2);if(evidence.length){text.innerHTML=`${esc(source.kind)} · ${evidence.length} cited passage${evidence.length===1?'':'s'}<br>${evidence.map(item=>`<span class="map-evidence-excerpt">${esc((item.text||'').slice(0,155))}${(item.text||'').length>155?'…':''}</span>`).join('') }`;}$('[data-map-source]').forEach(button=>button.classList.toggle('selected',button.dataset.mapSource===id));$('#sourceList [data-source-id]').forEach(row=>row.classList.toggle('map-highlight',row.dataset.sourceId===id));}
function renderSources() {
  const rows = state.sources.map((s,i)=>`<div class="source-row" data-source-id="${esc(s.id)}"><div class="source-icon">${s.kind==='PDF'?'▤':s.kind==='TABLE'?'▦':s.kind==='IMAGE'?'▧':'≡'}</div><div class="source-meta"><strong title="${esc(s.name)}">${esc(s.name)}</strong><small>${s.kind} · ${s.pages?`${s.pages} pages · `:''}${formatBytes(s.size)} · ${esc(s.status||'Ready')}</small></div><span class="source-score">${s.status==='Reading…'?'…':s.text.length?'Ready':s.status==='Could not read'?'Error':'Image'}</span></div>`).join('');
  $('#sourceList').innerHTML = rows || `<div class="empty-sources"><span>▤</span><strong>No sources yet</strong><p>Upload a file to start building your evidence map.</p></div>`;
  $('#sourceCount').textContent=state.sources.length; $('#mapSourceCount').textContent=`${state.sources.length} source${state.sources.length===1?'':'s'} connected`;
  $('#mapClaimCount').textContent=state.sources.length?`${state.sources.reduce((n,s)=>n+s.chunks.length,0)} evidence passages ready`:'Waiting for evidence';
  $('#evidenceLabel').textContent=state.sources.length?`${state.sources.length} source${state.sources.length===1?'':'s'} ready`:'No evidence added';
  $('#mapGraphic').classList.toggle('has-sources',state.sources.length>0);
  renderEvidenceMap();
  $('#modalSourceList').innerHTML=rows||'<div class="empty-sources"><strong>No sources added yet</strong><p>Add a PDF or another evidence file to begin.</p></div>';
}
function splitChunks(text) {
  return text.split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(x=>x.length>0).flatMap(line=>{
    if(line.length<600)return[line]; const parts=line.split(/(?<=[.!?])\s+/); const out=[]; let part=''; for(const sentence of parts){if((part+' '+sentence).length>520&&part){out.push(part.trim());part='';}part+=' '+sentence;} if(part.trim())out.push(part.trim());return out;
  });
}
async function readPdf(file) {
  const pdfjs=await loadScript('./vendor/pdf.min.js','pdfjsLib');
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),disableWorker:true}).promise; let pages=[];let pageTexts=[];let visualHints=[];let needsOcr=[];
  for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const content=await page.getTextContent();const text=pdfItemsToText(content.items);pages.push(text?`[Page ${p}] ${text}`:'');pageTexts.push(text);if(!text)needsOcr.push({page,p});try{const ops=await page.getOperatorList();const codes=pdfjs.OPS||{};const imageOps=new Set([codes.paintImageXObject,codes.paintInlineImageXObject,codes.paintImageMaskXObject,codes.paintJpegXObject].filter(Number.isInteger));const imageCount=ops.fnArray.filter(op=>imageOps.has(op)).length;const vectorCount=Number.isInteger(codes.constructPath)?ops.fnArray.filter(op=>op===codes.constructPath).length:0;if(imageCount||vectorCount>12)visualHints.push(p);}catch{}}
  let ocrUnavailable=false;
  if(needsOcr.length){
    let worker=null;try{worker=await getOcrWorker();for(const item of needsOcr.slice(0,40)){const canvas=await renderPdfPage(item.page);const {data}=await worker.recognize(canvas);pageTexts[item.p-1]=data.text.trim();pages[item.p-1]=`[Page ${item.p} · OCR] ${data.text.trim()}`;canvas.width=canvas.height=1;}await worker.terminate();}
    catch(error){ocrUnavailable=true;console.warn('OCR library unavailable; scanned pages will be offered to the local vision model.',error);if(worker)try{await worker.terminate();}catch{}for(const item of needsOcr.slice(0,40))if(!visualHints.includes(item.p))visualHints.push(item.p);}
  }
  return {text:pages.join('\n'),pages:pdf.numPages,pageTexts,visualHints,pdfHandle:pdf,ocrUnavailable};
}
function pdfItemsToText(items){const rows=[];for(const item of items||[]){const value=String(item.str||'').trim();if(!value)continue;const x=Number(item.transform?.[4]||0),y=Number(item.transform?.[5]||0);let row=rows.find(r=>Math.abs(r.y-y)<2.5);if(!row){row={y,items:[]};rows.push(row);}row.items.push({x,value});}return rows.sort((a,b)=>b.y-a.y).map(row=>row.items.sort((a,b)=>a.x-b.x).map(item=>item.value).join(' | ')).join('\n');}
async function getOcrWorker(){const tesseract=await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js','Tesseract');return tesseract.createWorker('eng');}
async function renderPdfPage(page,scale=1.6){const base=page.getViewport({scale});const factor=Math.min(1,1100/base.width);const viewport=page.getViewport({scale:scale*factor});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;return canvas;}
async function compressImage(file){try{const bitmap=await createImageBitmap(file);const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return canvas.toDataURL('image/jpeg',.72);}catch{return /.(png|jpe?g|webp)$/i.test(file.name)?await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>resolve('');reader.readAsDataURL(file);}):'';}}
async function readSpreadsheet(file){const XLSX=await loadScript('./vendor/xlsx.full.min.js','XLSX');const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});const sheets=workbook.SheetNames.slice(0,20);return sheets.map(name=>{const rows=XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,raw:false,defval:'',blankrows:false}).slice(0,2500);return '[Sheet: '+name+']\n'+rows.map(row=>row.map(value=>String(value??'').replace(/\s+/g,' ').trim()).join(' | ')).filter(row=>row.replace(/[|\s]/g,'')).join('\n');}).filter(Boolean).join('\n\n');}
async function readDocx(file) {
  const zip=await loadScript('./vendor/fflate.min.js','fflate'); const data=zip.unzipSync(new Uint8Array(await file.arrayBuffer()));
  const xml=new TextDecoder().decode(data['word/document.xml']||new Uint8Array()); const doc=new DOMParser().parseFromString(xml,'text/xml');
  return {text:[...doc.getElementsByTagName('w:p')].map(p=>[...p.getElementsByTagName('w:t')].map(t=>t.textContent).join('')).join('\n'),pages:null};
}
function csvToText(raw) {
  const delim=raw.includes('\t')&&!raw.includes(',')?'\t':',';const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<raw.length&&rows.length<2002;i++){const ch=raw[i];if(quoted){if(ch==='"'&&raw[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}else if(ch==='"')quoted=true;else if(ch===delim){row.push(cell.trim());cell='';}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&raw[i+1]==='\n')i++;row.push(cell.trim());if(row.some(value=>value!==''))rows.push(row);row=[];cell='';}else cell+=ch;}
  if(cell||row.length){row.push(cell.trim());if(row.some(value=>value!==''))rows.push(row);}
  if(!rows.length)return '';const head=rows[0];return rows.slice(1).map((row,i)=>`Record ${i+1}: ${head.map((h,j)=>`${h||`Column ${j+1}`} = ${row[j]||''}`).join('; ')}`).join('\n');
}
function jsonToEvidence(value){
  if(Array.isArray(value)&&value.every(item=>item&&typeof item==='object'&&!Array.isArray(item)))return value.slice(0,2000).map((row,i)=>`Record ${i+1}: ${Object.entries(row).map(([key,val])=>`${key} = ${typeof val==='object'?JSON.stringify(val):val}`).join('; ')}`).join('\n');
  const entries=[];function walk(node,path=''){if(node&&typeof node==='object'){for(const[key,val]of Object.entries(node))walk(val,path?`${path}.${key}`:key);}else entries.push(`${path} = ${String(node)}`);}walk(value);return entries.join('\n');
}
async function addFiles(files) {
  for(const file of files){
    if(state.sources.some(s=>s.name===file.name&&s.size===file.size)){toast(`${file.name} is already in this session.`);continue;}
    const kind=fileKind(file);if(file.size>30*1024*1024){toast(`${file.name} is over the 30 MB limit.`);continue;}
    const source={id:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`,name:file.name,size:file.size,kind,text:'',pages:null,pageTexts:[],visualHints:[],visualCache:new Map(),pdfHandle:null,visualImage:'',chunks:[],file,status:'Reading…'};
    state.sources.push(source);renderSources();renderSearchHistory();renderChips();toast(`Reading ${file.name}…`);
    try{
      if(kind==='PDF'){const result=await readPdf(file);source.text=result.text;source.pages=result.pages;source.pageTexts=result.pageTexts;source.visualHints=result.visualHints;source.pdfHandle=result.pdfHandle;source.ocrUnavailable=!!result.ocrUnavailable;}
      else if(kind==='DOCX'){const result=await readDocx(file);source.text=result.text;}
      else if(kind==='TABLE'){if(/\.xlsx?$/i.test(file.name))source.text=await readSpreadsheet(file);else{const raw=await file.text();source.text=csvToText(raw);}} 
      else if(kind==='JSON'){const value=JSON.parse(await file.text());source.text=jsonToEvidence(value);}
      else if(kind==='IMAGE'){source.visualImage=await compressImage(file);const worker=await getOcrWorker();const {data}=await worker.recognize(file);await worker.terminate();source.text=data.text;source.imageOnly=!source.text.trim();}
      else source.text=await file.text();
      source.chunks=splitChunks(source.text).map((text,index)=>({text,index,source}));source.status=source.chunks.length?'Ready':'No readable text';
      toast(source.ocrUnavailable?`${file.name} loaded; scanned pages will be read by the local vision model.`:source.imageOnly?`${file.name} contains no readable text; ask Toxic to inspect the image.`:`${file.name} is ready to search.`);
    }catch(e){console.error(e);if(kind==='IMAGE'&&source.visualImage){source.imageOnly=true;source.ocrUnavailable=true;source.status='Ready for vision';toast(`${file.name} loaded; ask Toxic to inspect it with the local vision model.`);}else{source.status='Could not read';source.error=e.message;toast(`${file.name}: ${e.message||'could not be read'}`);}}
    renderSources();renderChips();
  }
  renderSources();renderChips();
}
function renderChips(){ $('#attachedFiles').innerHTML=state.sources.slice(-4).map(s=>`<span class="file-chip">▤ ${esc(s.name)} <button data-remove="${s.id}" aria-label="Remove ${esc(s.name)}">×</button></span>`).join(''); $$('[data-remove]').forEach(b=>b.onclick=()=>removeSource(b.dataset.remove)); }
function removeSource(id){state.sources=state.sources.filter(s=>s.id!==id);renderSources();renderChips();}
function tokenize(text){return text.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g)||[];}
const stop=new Set('the a an and or but to of in on for from by with as is are was were be been being it this that these those about what where when why how which who whom does did do can could should would may might we they you your their our i me my its into across between most main findings evidence source sources report document file claim claims tell me explain describe summarize summary please true false correct accurate factual fact sufficient enough adequate sufficiency prove proves proven'.split(' '));
function stem(word){return word.replace(/ies$/,'y').replace(/(ing|ed|es|s)$/,'').replace(/(.)\1$/,'$1');}
function rankEvidence(question){
 const all=state.sources.flatMap(source=>source.chunks.map(c=>({...c,words:tokenize(c.text)})));if(!all.length)return[];
 const query=[...new Set(tokenize(question).filter(w=>(w.length>2||/^\d/.test(w))&&!stop.has(w)))];
 const broad=/\b(summar(y|ize|ise)|overview|main (points|ideas|takeaways)|key findings)\b/i.test(question);
 const terms=query;
 const avg=all.reduce((n,c)=>n+c.words.length,0)/all.length||1;const df=new Map();
 for(const c of all)for(const t of new Set(c.words.map(stem)))df.set(t,(df.get(t)||0)+1);
 const scored=[];
 for(const c of all){const tf=new Map();for(const w of c.words){const s=stem(w);tf.set(s,(tf.get(s)||0)+1);}let score=0,covered=0;
   for(const term of terms){const key=stem(term),count=tf.get(key)||0;if(count){covered++;const idf=Math.log(1+(all.length-(df.get(key)||0)+.5)/((df.get(key)||0)+.5));const lenFactor=count*2.2/(count+1.2*(.25+.75*c.words.length/avg));score+=idf*lenFactor;}}
   if(broad&&!terms.length)score=1/Math.sqrt(c.index+1);
   if(score>0)scored.push({...c,score,coverage:terms.length?covered/terms.length:1,terms});
 }
 scored.sort((a,b)=>b.score-a.score);return scored.slice(0,10);
}
function questionTerms(question){return [...new Set(tokenize(question).filter(w=>(w.length>2||/^\d/.test(w))&&!stop.has(w)).map(stem))];}
function questionWithContext(question){const previous=[...state.chatHistory].reverse().find(m=>m.role==='user')?.content||'';const current=String(question||'').trim();if(!previous||!current)return current;const startsFollowUp=/^(?:and\b|also\b|then\b|what about\b|how about\b|why so\b|how so\b|what else\b|tell me more\b|go on\b|continue\b|which one\b|what next\b|why\s*\??$|how\s+so\s*\??$)/i.test(current);const refersBack=/^(?:it|that|they|them|those|these|there|the same|the former|the latter|this one)\b/i.test(current)||/^(?:what|why|how|where|when|which|does|do|is|are)\b.*\b(?:it|that|they|them|those|these|there|the same|above|previous)\b/i.test(current);return startsFollowUp||refersBack?`${previous} ${current}`:current;}
function evidenceMatchesQuery(query,evidence){const terms=questionTerms(query);if(!terms.length)return false;return evidence.some(item=>{const words=new Set(tokenize(item.text||item.item?.text||'').map(stem));const hits=terms.filter(term=>words.has(term)).length;const required=terms.length<=3?1:2;return hits>=required&&hits/terms.length>=(terms.length<=3?.3:.22);});}
function evidenceDirectlyMatches(question,evidence){return evidenceMatchesQuery(questionWithContext(question),evidence);}
function evidenceMatchesSearchPlan(entry,queries=[]){return queries.some(query=>evidenceMatchesQuery(query,[entry]));}
function asksAboutVisuals(question){return /\b(image|picture|photo|figure|diagram|chart|graph|plot|flowchart|map|illustration|structure|schematic|visual|shown|depict|axis|axes|legend|trend|drawn|shape|color|colour)\b|what\s+(?:does|is)\s+(?:the\s+)?(?:image|figure|diagram|chart|graph|plot|picture)\s+(?:show|mean|depict)/i.test(question);}
async function collectVisualEvidence(question,selected=[]){
 const visualIntent=asksAboutVisuals(question)||(!selected.length&&state.sources.some(source=>source.kind==='PDF'&&(source.visualHints||[]).length));const result=[];const selectedPages=new Map();for(const entry of selected){const page=Number((entry.text.match(/\[Page (\d+)/)||[])[1]);if(page){const list=selectedPages.get(entry.item.source.id)||[];list.push(page);selectedPages.set(entry.item.source.id,list);}}
 for(const source of state.sources){if(result.length>=3)break;if(source.kind==='IMAGE'&&source.visualImage&&(visualIntent||state.sources.filter(s=>s.kind==='IMAGE').length===1)){result.push({source:source.name,page:1,caption:'Uploaded image',image:source.visualImage});continue;}if(source.kind!=='PDF'||(!visualIntent&&!selectedPages.has(source.id)))continue;
   try{const pdf=source.pdfHandle||await (async()=>{const pdfjs=await loadScript('./vendor/pdf.min.js','pdfjsLib');return pdfjs.getDocument({data:new Uint8Array(await source.file.arrayBuffer()),disableWorker:true}).promise;})();source.pdfHandle=pdf;
     const terms=questionTerms(question);const candidates=new Map();for(const page of source.visualHints||[])candidates.set(page,2);for(const page of selectedPages.get(source.id)||[])candidates.set(page,(candidates.get(page)||0)+4);
     if(visualIntent&&(!candidates.size||candidates.size<2)){const scored=(source.pageTexts||[]).map((text,index)=>({page:index+1,score:questionTerms(text).filter(term=>terms.includes(term)).length})).sort((a,b)=>b.score-a.score);for(const item of scored.slice(0,3))candidates.set(item.page,Math.max(candidates.get(item.page)||0,item.score));}
     const chosen=[...candidates].sort((a,b)=>b[1]-a[1]).slice(0,3-result.length);for(const [pageNo]of chosen){if(!pageNo||pageNo>pdf.numPages)continue;let image=source.visualCache.get(pageNo);if(!image){const canvas=await renderPdfPage(await pdf.getPage(pageNo),1);image=canvas.toDataURL('image/jpeg',.62);source.visualCache.set(pageNo,image);canvas.width=canvas.height=1;}result.push({source:source.name,page:pageNo,caption:`PDF page ${pageNo}`,image});if(result.length>=3)break;}
   }catch(error){console.warn(`Could not prepare page images from ${source.name}:`,error);}
 }
 return result.slice(0,3);
}
function extractClaims(text){const sentences=text.match(/[^.!?\n]+[.!?]?/g)||[text];return sentences.map(t=>t.trim()).filter(t=>t.length>30&&t.length<400);}
function keyNumbers(text){return [...text.matchAll(/(?:\$\s*)?\b\d+(?:[,.]\d+)*(?:\s?%|\s?(?:days?|weeks?|months?|years?|hours?|kg|km|miles?))?\b/gi)].map(x=>x[0].replace(/\s+/g,'').toLowerCase());}
function findConflicts(evidence){
 const claims=[];
 for(const e of evidence){for(const claim of extractClaims(e.text.replace(/^\[Page \d+(?: · OCR)?\]\s*/,''))){const nums=keyNumbers(claim).filter(n=>!/^\d+(?:[,.]\d+)*$/.test(n));if(!nums.length)continue;const words=new Set(tokenize(claim).filter(w=>!stop.has(w)&&w.length>3&&!/^\d/.test(w)));if(words.size<3)continue;claims.push({nums:[...new Set(nums)],claim,source:e.source.name,sourceId:e.source.id,score:e.score,words});}}
 const conflicts=[];const seen=new Set();
 for(let i=0;i<claims.length;i++)for(let j=i+1;j<claims.length;j++){const a=claims[i],b=claims[j];if(a.sourceId===b.sourceId||a.nums.join('|')===b.nums.join('|'))continue;const overlap=[...a.words].filter(w=>b.words.has(w)).length/Math.min(a.words.size,b.words.size);if(overlap<.72)continue;const key=[a.sourceId,b.sourceId,[...a.words].filter(w=>b.words.has(w)).sort().join(' ')].join(':');if(seen.has(key))continue;seen.add(key);conflicts.push({key,items:[a,b].sort((x,y)=>y.score-x.score)});}
 return conflicts.slice(0,3);
}
function reliability(source,ev){let score=50;if(source.kind==='PDF'||source.kind==='DOCX')score+=8;if(/\b(method|survey|dataset|source|reference|published|author|date|study)\b/i.test(source.text))score+=13;if(/\b(maybe|rumor|unverified|anonymous|allegedly)\b/i.test(source.text))score-=12;if(source.text.length>1000)score+=8;if(source.text.length<150)score-=15;if(ev&&ev.score>3)score+=5;return Math.max(25,Math.min(92,score));}
function negated(text){return /\b(not|never|no|neither|without|failed to|false|incorrect|didn't|doesn't|isn't|aren't|wasn't|weren't|cannot|can't)\b/i.test(text);}
function assessEvidence(question,evidence,conflicts,broad){
 const binary=/^(?:is it true|is it correct|is it accurate|is|are|was|were|does|do|did|has|have|can|could|will|would|should)\b/i.test(question.trim());
 const asksSufficiency=/\b(sufficient|enough|adequate)\b.{0,35}\bevidence\b|\bevidence\b.{0,35}\b(sufficient|enough|adequate)\b/i.test(question);
 const relevant=evidence.filter(e=>e.coverage>=(binary?0.5:0.25)||broad);const independent=new Set(relevant.map(e=>e.source.id));
 const questionNegated=negated(question);const support=new Set(),opposition=new Set();
 for(const e of relevant){const goesAgainst=negated(e.text)!==questionNegated;(goesAgainst?opposition:support).add(e.source.id);}
 let verdict='evidence',sufficiency='limited',label='Evidence located',reason='These excerpts are relevant to the question, but relevance alone does not establish that a claim is true.';
 if(!relevant.length){verdict='insufficient';sufficiency='insufficient';label='Insufficient evidence';reason='No retrieved passage closely addresses the question, so the available files do not support a reliable conclusion.';}
 else if(conflicts.length||(support.size&&opposition.size)){verdict='mixed';sufficiency='unresolved';label='Conflicting evidence';reason='Some evidence supports the claim while other evidence points against it, or independent sources report different values. The available evidence does not settle the disagreement.';}
 else if(binary&&opposition.size){verdict='contradicted';label='Contradicted by the available evidence';reason='The most relevant passages state the opposite of the claim in the question. This describes the uploaded sources, not proof about every possible source.';}
 else if(binary&&support.size){verdict='supported';label='Supported by the available evidence';reason='The relevant passages are consistent with the claim. This means the uploaded evidence supports it; it is not an independent verification of universal truth.';}
 if(relevant.length&&verdict!=='insufficient'&&verdict!=='mixed'){
   if(independent.size>=3&&relevant[0].coverage>=.65)sufficiency='strong';
   else if(independent.size>=2&&relevant[0].coverage>=.4)sufficiency='moderate';
   else sufficiency='limited';
 }
 if(verdict==='mixed')sufficiency='unresolved';
 if(asksSufficiency){verdict=sufficiency==='strong'||sufficiency==='moderate'?'supported':sufficiency==='unresolved'?'mixed':'insufficient';label=sufficiency==='strong'?'Evidence appears sufficient':sufficiency==='moderate'?'Evidence is partly sufficient':sufficiency==='unresolved'?'Evidence conflicts; conclusion unresolved':'Not enough evidence yet';reason=sufficiency==='strong'?'Several independent sources closely match the question, with no disagreement detected.':sufficiency==='moderate'?'More than one relevant source was found, but gaps remain; verify the cited passages before relying on the conclusion.':sufficiency==='unresolved'?'Relevant sources disagree, so there is not enough agreement to settle the conclusion.':'The retrieved evidence is too limited or comes from too few independent sources to support a confident conclusion.';}
 const sourceCount=independent.size;
 return{verdict,sufficiency,label,reason,sourceCount,binary,positive: support.size,negative:opposition.size};
}
function focusedExcerpt(text,terms,maxSentences=1){
 const clean=String(text||'').replace(/^\[Page \d+(?: · OCR)?\]\s*/,'').replace(/\s+/g,' ').trim();
 const parts=clean.match(/[^.!?]+[.!?]?/g)||[clean];
 const ranked=parts.map((sentence,index)=>{const words=new Set(tokenize(sentence));const hits=terms.filter(term=>words.has(term)||words.has(stem(term))).length;return{sentence:sentence.trim(),index,hits};}).filter(x=>x.sentence.length>12);
 if(!ranked.length)return clean.slice(0,240);
 const chosen=ranked.sort((a,b)=>b.hits-a.hits||a.index-b.index).slice(0,maxSentences).sort((a,b)=>a.index-b.index);
 return chosen.map(x=>x.sentence).join(' ').slice(0,420);
}
function buildAnswer(question){const searchQuestion=questionWithContext(question);const ranked=rankEvidence(searchQuestion);const terms=questionTerms(searchQuestion);const broad=/\b(summar(y|ize|ise)|overview|main (points|ideas|takeaways)|key findings)\b/i.test(searchQuestion);const evidence=broad?ranked:ranked.filter(item=>evidenceDirectlyMatches(question,[item]));const conflicts=findConflicts(evidence);let answerEvidence=[];
 const assessment=assessEvidence(question,evidence,conflicts,broad);
 let confidence='Low confidence',low=true;
 if(evidence.length>=2&&evidence[0].coverage>=.5){confidence='Moderate evidence match';low=false;}if(evidence.length>=4&&evidence[0].coverage>=.75&&!conflicts.length){confidence='Strong evidence match';low=false;}
 let body='';
 if(!state.sources.length){body='Add a document or dataset, then ask a question about it.';}
 else if(!evidence.length){const readErrors=state.sources.filter(s=>s.status==='Could not read');const hasImages=state.sources.some(s=>s.kind==='IMAGE'||s.kind==='PDF');body=readErrors.length===state.sources.length?`I couldn’t read the uploaded files. ${readErrors[0]?.error||'Check the file format and try again.'}`:asksAboutVisuals(question)&&hasImages?'I can’t identify details in the image or diagram in evidence-only mode. Connect an Ollama vision-capable model, then ask again. I won’t guess from nearby text.':'I couldn’t find a passage that directly answers this specific question. The uploaded files may not contain the requested detail.';}
 else {
   const best=evidence.slice(0,broad?3:2);
   {
     answerEvidence=best.slice(0,broad?3:2);
     const lines=best.map((e,i)=>`${broad?'• ':''}${focusedExcerpt(e.text,terms,broad?2:1)} <cite data-index="${i}">[${i+1}]</cite>`);
     body=broad?`Key details in the files:\n${lines.join('\n')}`:`The document states: ${lines[0]}`;
     if(conflicts.length)body+='\nThe retrieved sources may disagree; compare the cited passages.';
   }
 }
 return {body,evidence:answerEvidence,conflicts,confidence,low,assessment,mode:'Evidence-only'};
}
function selectModelEvidence(question,extraQueries=[]){
 const retrievalQuestion=questionWithContext(question);
 const queries=[...new Set([retrievalQuestion,...extraQueries].map(q=>String(q||'').trim()).filter(Boolean))].slice(0,7);const merged=new Map();
 for(const query of queries)for(const item of rankEvidence(query)){const key=`${item.source.id}:${item.index}`;const existing=merged.get(key);if(existing){existing.score+=item.score*.35;existing.hits+=1;existing.coverage=Math.max(existing.coverage,item.coverage);}else merged.set(key,{...item,hits:1});}
 const ranked=[...merged.values()].sort((a,b)=>(b.score+Math.log2(b.hits))-(a.score+Math.log2(a.hits)));const selected=[];const sourceCounts=new Map();
 for(const item of ranked){if((sourceCounts.get(item.source.id)||0)===0){selected.push(item);sourceCounts.set(item.source.id,1);if(selected.length===6)break;}}
 if(selected.length<6)for(const item of ranked){if(selected.includes(item))continue;const count=sourceCounts.get(item.source.id)||0;if(count<2){selected.push(item);sourceCounts.set(item.source.id,count+1);if(selected.length===8)break;}}
 return selected.map((item,index)=>({id:`E${index+1}`,item,source:item.source.name,location:item.source.pages?`page ${(item.text.match(/\[Page (\d+)/)||[])[1]||'unknown'}`:`passage ${item.index+1}`,text:item.text}));
}
async function requestQuestionAnalysis(question){
 const response=await fetch(`${API_BASE}/api/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:selectedModel,question})});
 const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Could not analyze the question.');
 try{return JSON.parse(payload.response);}catch{throw new Error('The local model returned an unreadable question analysis.');}
}
async function requestSearchPlan(question,evidence,gaps=[],analysis={}){
 const passages=evidence.map(item=>({source:item.source,text:item.text,location:item.location}));
 const response=await fetch(`${API_BASE}/api/search-plan`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:selectedModel,question,evidence:passages,analysis,history:state.chatHistory.slice(-4),gaps})});
 const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Could not plan an evidence search.');let plan;try{plan=JSON.parse(payload.response);}catch{throw new Error('The local model returned an unreadable search plan.');}
 return sanitizeSearchQueries(Array.isArray(plan.search_queries)?plan.search_queries:[],question,evidence);
}
function sanitizeSearchQueries(queries,question,evidence){
 const cleaned=queries.map(query=>[...new Set(tokenize(String(query)).map(stem).filter(term=>term.length>2&&term.length<32&&!stop.has(term)))].slice(0,8).join(' ')).filter(Boolean);
 return [...new Set(cleaned)].slice(0,5);
}
async function requestModelAnswer(question,selected,analysis={},visualEvidence=[]){
 const passages=selected.map(item=>({source:item.source,location:item.location,text:item.text}));
 const activeVision=activeVisionModel();
 if(visualEvidence.length&&!activeVision)throw new Error('This question needs image reading, but Ollama has no vision-capable model installed. Install one in Ollama, then set its name in Toxic’s settings.');
 const response=await fetch(`${API_BASE}/api/answer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:selectedModel,visionModel:activeVision,question,analysis,evidence:passages,visualEvidence,history:state.chatHistory.slice(-6),preferences:answerPreferences})});
 const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Local AI could not answer this question.');
 let result;try{result=JSON.parse(payload.response);}catch{throw new Error('The local model returned an unreadable answer. Try again or use evidence mode.');}
 const generalMode=selected.length===0&&visualEvidence.length===0&&state.sources.length===0;
 let audit='not checked';if(!generalMode){try{const checkResponse=await fetch(`${API_BASE}/api/verify`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:selectedModel,visionModel:activeVision,question,draft:result,evidence:passages.map((entry,i)=>({id:`E${i+1}`,...entry})),visualEvidence,preferences:answerPreferences})});const checkPayload=await checkResponse.json();if(checkResponse.ok){const checked=JSON.parse(checkPayload.response);if(checked&&typeof checked.answer==='string'){result={...result,...checked};audit=checked.verified?'checked':'revised';}}}catch(error){console.warn('Answer check unavailable:',error);}}
 const validVerdicts=new Set(['supported','contradicted','mixed','insufficient','evidence']);const validSuff=new Set(['strong','moderate','limited','unresolved','insufficient']);
 let verdict=validVerdicts.has(result.verdict)?result.verdict:'insufficient';let sufficiency=validSuff.has(result.sufficiency)?result.sufficiency:'limited';
 const citationEvidence=[...selected.map((entry,index)=>({id:`E${index+1}`,entry:entry.item})),...visualEvidence.map((item,index)=>({id:`V${index+1}`,entry:{source:{id:`visual:${item.source}:${item.page}`,name:item.source,pages:item.page},index:(item.page||1)-1,text:`Visual evidence from page ${item.page||1}. ${item.caption||''}`,score:1,visualImage:item.image}}))];const idMap=new Map(citationEvidence.map((item,index)=>[item.id,index]));const claims=Array.isArray(result.claims)?result.claims.slice(0,3):[];const used=[...new Set(claims.flatMap(claim=>(Array.isArray(claim.evidence_ids)?claim.evidence_ids:[]).map(id=>idMap.get(id)).filter(i=>i!==undefined)))].slice(0,3);
 if(!used.length&&!generalMode){const direct=selected.map((entry,index)=>({entry,index})).filter(({entry})=>evidenceDirectlyMatches(question,[entry])).sort((a,b)=>(b.entry.coverage||0)-(a.entry.coverage||0)).slice(0,2);if(direct.length){for(const item of direct)used.push(item.index);const excerpt=focusedExcerpt(direct[0].entry.text,questionTerms(question),1);result.answer=`The relevant passage says: “${excerpt}”`;result.verdict='evidence';result.sufficiency='limited';result.reasoning='This answer is quoted from a passage that matches the question; check the cited source for context.';verdict='evidence';sufficiency='limited';}else{result.answer='I could not find a passage or image that directly answers this question, so I cannot confirm it from the uploaded material.';result.verdict='insufficient';result.sufficiency='insufficient';verdict='insufficient';sufficiency='insufficient';}}
 const answer=String(result.answer||'The local model did not return an answer.').trim();
 if(generalMode){return {body:answer,evidence:[],conflicts:[],confidence:'No files attached',low:true,mode:'General local AI',analysis,audit:'not applicable',missingEvidence:[],assessment:{verdict:'evidence',sufficiency:'insufficient',label:'General answer · no file evidence',reason:'This response uses the local model’s general knowledge; no uploaded sources were available to verify it.',sourceCount:0}};}const citationText=used.map(i=>`<cite data-index="${i}">[${i+1}]</cite>`).join(' ');const bodyParts=[`${answer}${citationText?` ${citationText}`:''}`];
 const evidence=used.map(i=>citationEvidence[i].entry);const sources=new Set(evidence.map(e=>e.source.id));const labels={supported:'Supported by the available evidence',contradicted:'Contradicted by the available evidence',mixed:'Conflicting evidence',insufficient:'Insufficient evidence',evidence:'Relevant evidence found'};
 const suffLabels={strong:'Strong evidence',moderate:'Moderate evidence',limited:'Limited evidence',unresolved:'Unresolved',insufficient:'Insufficient'};
 const conflicts=findConflicts(rankEvidence(question).filter(item=>evidenceDirectlyMatches(question,[item])));if(sources.size<2&&sufficiency!=='unresolved'&&sufficiency!=='insufficient')sufficiency='limited';else if(sources.size<3&&sufficiency==='strong')sufficiency='moderate';if(conflicts.length&&verdict!=='insufficient'){sufficiency='unresolved';}
 const finalVerdict=conflicts.length&&verdict!=='insufficient'?'mixed':verdict;const low=['limited','unresolved','insufficient'].includes(sufficiency);
 return {body:bodyParts.join('\n\n'),evidence,conflicts,confidence:suffLabels[sufficiency],low,mode:'Local AI',analysis,audit,missingEvidence:Array.isArray(result.missing_evidence)?result.missing_evidence.slice(0,5):[],assessment:{verdict:finalVerdict,sufficiency,label:labels[finalVerdict],reason:String(result.reasoning||'Assessment is based only on retrieved passages from the uploaded files.'),sourceCount:sources.size}};
}
function visionUnavailableResult(){return{body:'This question depends on a figure, diagram, or image, but no vision-capable Ollama model is connected. Toxic will not guess from nearby text. Install an image-capable Ollama model, enter its name under the gear icon, and ask again.',evidence:[],conflicts:[],confidence:'Vision model needed',low:true,mode:'Evidence-only',audit:'not checked',assessment:{verdict:'insufficient',sufficiency:'insufficient',label:'Image evidence not analyzed',reason:'A vision-capable local model is needed to inspect the uploaded visual evidence.',sourceCount:0}};}
async function answerWithLocalModel(question,onStage=()=>{}){
 let selected=selectModelEvidence(question);onStage('Matching your question to the uploaded evidence…');
 const fast=/^.{1,140}$/s.test(question)&&tokenize(question).length<=12&&!/\b(compare|contrast|contradict|conflict|reconcile|summari[sz]|overview|each|all|every|rank|calculate|compute|derive|prove|why|how|explain|steps?|relationship|between|both|evaluate|assess)\b/i.test(question);
 let analysis={restatement:question,task_type:fast?'factual':'other',subquestions:[question],answer_requirements:[],ambiguity:'minor'};
 if(!fast){onStage('Understanding the exact question…');try{analysis=await requestQuestionAnalysis(question);}catch(error){console.warn('Question analysis unavailable; continuing with direct search.',error);}}
 let visualEvidence=await collectVisualEvidence(question,selected);const broad=/\b(summar(y|ize|ise)|overview|main (points|ideas|takeaways)|key findings)\b/i.test(question);
 if(visualEvidence.length&&!activeVisionModel())return visionUnavailableResult();
 const hasTextEvidence=state.sources.some(source=>source.chunks.length>0);
 let firstPlan=[];
 const needsSearchPlan=hasTextEvidence&&(!selected.length||!fast||(selected[0]?.coverage||0)<.62);
 if(needsSearchPlan){onStage(selected.length?'Searching exact details and alternate wording…':'Searching uploaded files for alternate wording…');try{firstPlan=await requestSearchPlan(question,selected,selected.length?[]:(analysis.subquestions||[question]),analysis);const expanded=selectModelEvidence(question,firstPlan);if(expanded.length)selected=expanded;}catch(error){console.warn('Search expansion unavailable; using directly matched passages.',error);}}
 if(!broad)selected=selected.filter(entry=>evidenceDirectlyMatches(question,[entry])||evidenceMatchesSearchPlan(entry,firstPlan));
 if(!selected.length&&!visualEvidence.length&&state.sources.length)return buildAnswer(question);
 onStage(visualEvidence.length?'Reading document images with Ollama…':fast?'Writing a focused answer…':'Drafting from matching evidence…');
 let result=await requestModelAnswer(question,selected,analysis,visualEvidence);result.analysis=analysis;
 if(!fast&&result.missingEvidence.length&&(selected.length||hasTextEvidence)){
   onStage('Checking other passages for the missing detail…');
   try{const followPlan=await requestSearchPlan(question,selected,result.missingEvidence,analysis);let expanded=selectModelEvidence(question,[...firstPlan,...followPlan]);if(!broad)expanded=expanded.filter(entry=>evidenceDirectlyMatches(question,[entry])||evidenceMatchesSearchPlan(entry,[...firstPlan,...followPlan]));const known=new Set(selected.map(x=>`${x.item.source.id}:${x.item.index}`));if(expanded.some(x=>!known.has(`${x.item.source.id}:${x.item.index}`))){onStage('Updating the answer with additional evidence…');selected=expanded;result=await requestModelAnswer(question,selected,analysis,visualEvidence);result.analysis=analysis;}}catch(error){console.warn('Follow-up search unavailable:',error);}
 }
 return result;
}
function renderAnswer(question,result){
 lastMapQuestion=question;renderEvidenceMap(result);const id=`answer-${Date.now()}`;const citations=result.evidence.map((e,i)=>`<div class="source-citation"><strong><span class="source-score">[${i+1}]</span>${esc(e.source.name)} <small>${e.source.pages?`· page ${((e.text.match(/\[Page (\d+)\]/)||[])[1]||e.source.pages)}`:`· passage ${e.index+1}`}</small></strong><p>${esc(e.text.slice(0,460))}${e.text.length>460?'…':''}</p>${e.visualImage?`<img class="visual-source-preview" src="${esc(e.visualImage)}" alt="Page ${e.source.pages||1} visual evidence">`:''}<small>${e.visualImage?'Visual evidence · inspected by the image model':`Match score ${e.score.toFixed(1)} · source reliability signal ${reliability(e.source,e)}/100`}</small></div>`).join('');
 const conflictHtml=result.conflicts.length?`<div class="conflict-card"><strong>⚖ Potential disagreement found</strong>${result.conflicts.map(c=>`<div class="conflict-item">${c.items.map(i=>`“${esc(i.claim.slice(0,180))}” <span>— ${esc(i.source)}</span>`).join('<br>')}</div>`).join('')}</div>`:'';
 const assessment=result.assessment||{verdict:'insufficient',sufficiency:'insufficient',label:'Insufficient evidence',reason:result.body,sourceCount:0};
 const verdictHtml=`<div class="verdict-panel verdict-${assessment.verdict}"><span class="verdict-icon">${assessment.verdict==='supported'?'✓':assessment.verdict==='contradicted'?'×':assessment.verdict==='mixed'?'⚖':'?'}</span><div class="verdict-copy"><strong>${esc(assessment.label)}</strong><p>${esc(assessment.reason)}</p></div><div class="sufficiency"><small>EVIDENCE</small><strong>${esc(assessment.sufficiency)}</strong><span>${assessment.sourceCount} independent source${assessment.sourceCount===1?'':'s'}</span></div></div>`;
 const modeLabel=result.mode==='General local AI'?'General local AI · not file-checked':result.mode==='Local AI'?'Generated by local AI':'Evidence-only fallback';
 const understood=result.analysis?.restatement?`<div class="understood-note"><strong>I understood this as</strong><span>${esc(result.analysis.restatement)}</span>${result.analysis.task_type?`<small>Question type: ${esc(result.analysis.task_type.replaceAll('_',' '))}</small>`:''}</div>`:'';
 const html=`<div class="message"><div class="answer-card"><div class="answer-head"><span class="answer-mark">✳</span><span class="answer-title">Evidence assessment</span><span class="answer-confidence ${result.low?'low':''}">${result.confidence}</span><button class="copy-answer" data-copy="${id}">Copy answer</button></div>${understood}${verdictHtml}<div class="answer-text" id="${id}-answer">${esc(result.body).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/&lt;cite data-index=&quot;(\d+)&quot;&gt;\[(\d+)\]&lt;\/cite&gt;/g,'<button class="citation" data-cite="$1">[$2]</button>').replace(/\n/g,'<br>')}</div>${conflictHtml}<div class="analysis-tags"><span class="analysis-tag grounded">✓ ${result.evidence.length} cited passages</span>${result.conflicts.length?'<span class="analysis-tag conflict">⚖ possible conflict</span>':'<span class="analysis-tag">No numeric conflict detected</span>'}<span class="analysis-tag">${modeLabel}</span>${result.audit&&result.audit!=='not checked'?'<span class="analysis-tag grounded">✓ Answer checked</span>':'<span class="analysis-tag">Answer check unavailable</span>'}</div><div class="sources-used"><button class="sources-toggle" data-toggle="${id}-sources">⌄ View evidence & source details</button><div id="${id}-sources" class="source-citations">${citations||'<div class="source-citation"><p>No matching passages.</p></div>'}</div></div></div></div>`;
 messages.insertAdjacentHTML('beforeend',html);
 $$('[data-toggle]').forEach(b=>b.onclick=()=>{$(`#${b.dataset.toggle}`).classList.toggle('open');b.textContent=$(`#${b.dataset.toggle}`).classList.contains('open')?'⌃ Hide evidence & source details':'⌄ View evidence & source details';});
 $$('[data-cite]').forEach(b=>b.onclick=()=>{const box=$(`#${id}-sources`);box.classList.add('open');box.scrollIntoView({behavior:'smooth',block:'nearest'});});
 $$('[data-copy]').slice(-1).forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(`${question}\n\n${result.body.replace(/<cite[^>]*>|<\/cite>/g,'')}`);toast('Answer copied.');}catch{toast('Copy is unavailable in this browser.');}});
}
async function ask(question){if(state.isBusy)return;if(!question.trim())return;recordSearch(question);state.isBusy=true;$('#sendBtn').disabled=true;welcome.style.display='none';messages.classList.add('visible');if(!state.questionCount)$('#recentTitle').textContent=question.slice(0,28)+(question.length>28?'…':'');state.questionCount++;
 messages.insertAdjacentHTML('beforeend',`<div class="message user-message"><div class="user-bubble">${esc(question)}</div></div>`);const thinking=document.createElement('div');thinking.className='message';thinking.innerHTML='<div class="answer-card"><span style="color:#7a8c7f;font-size:11px">Looking across your evidence…</span></div>';messages.appendChild(thinking);messages.scrollTop=messages.scrollHeight;
 try{await new Promise(r=>setTimeout(r,80));const visualQuestion=asksAboutVisuals(question)&&state.sources.some(s=>s.kind==='IMAGE'||s.kind==='PDF');let result;if(localAiReady){try{result=await answerWithLocalModel(question,label=>{const status=thinking.querySelector('span');if(status)status.textContent=label;});}catch(error){console.error('Local AI request failed:',error);toast(`${error.message} Showing only direct text evidence.`);result=visualQuestion?visionUnavailableResult():buildAnswer(question);}}else result=visualQuestion?visionUnavailableResult():buildAnswer(question);thinking.remove();renderAnswer(question,result);state.chatHistory.push({role:'user',content:question},{role:'assistant',content:result.body.replace(/<cite[^>]*>|<\/cite>/g,'')});state.chatHistory=state.chatHistory.slice(-8);messages.scrollTop=messages.scrollHeight;}
 catch(error){console.error('Answer generation failed:',error);thinking.remove();renderAnswer(question,{body:'I hit an issue while preparing this answer. Your files are still loaded; please try the question again.',evidence:[],conflicts:[],confidence:'Answer error',low:true});}
 finally{input.value='';input.style.height='auto';state.isBusy=false;$('#sendBtn').disabled=false;}}
attachBtn.onclick=()=>fileInput.click();$('#addSourceLink').onclick=()=>fileInput.click();$('#modalAdd').onclick=()=>{fileInput.click();$('#modalBackdrop').classList.remove('open');};fileInput.onchange=async()=>{if(fileInput.files.length)await addFiles([...fileInput.files]);fileInput.value='';};
$('#sendBtn').onclick=()=>ask(input.value);input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask(input.value);}});input.addEventListener('input',()=>{input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,130)}px`;});
$$('.starter').forEach(b=>b.onclick=()=>{input.value=b.dataset.question;input.focus();if(state.sources.length)ask(input.value);else toast('Add evidence first, or ask a question to see how the workspace works.');});
$('#newChat').onclick=()=>{messages.innerHTML='';messages.classList.remove('visible');welcome.style.display='block';state.questionCount=0;state.chatHistory=[];$('#recentTitle').textContent='Untitled investigation';input.value='';};
$('#sourcesNav').onclick=()=>$('#modalBackdrop').classList.add('open');$('#closeModal').onclick=()=>$('#modalBackdrop').classList.remove('open');$('#modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')e.currentTarget.classList.remove('open');};
$('#aiSettings').onclick=()=>{$('#aiBackdrop').classList.add('open');populatePreferenceForm();};$('#closeAiModal').onclick=()=>$('#aiBackdrop').classList.remove('open');$('#aiBackdrop').onclick=e=>{if(e.target.id==='aiBackdrop')e.currentTarget.classList.remove('open');};$('#refreshModel').onclick=refreshModelStatus;$('#saveModel').onclick=()=>{const name=$('#modelName').value.trim();if(!name){toast('Enter the name of an installed Ollama model.');return;}selectedModel=name;localStorage.setItem(MODEL_KEY,name);saveAnswerPreferences();refreshModelStatus();toast('Answer preferences saved for this browser.');};
$('#mapNodes').onclick=e=>{const node=e.target.closest('[data-map-source]');if(!node)return;showMapSource(node.dataset.mapSource);const row=$('#sourceList [data-source-id=\"'+CSS.escape(node.dataset.mapSource)+'\"]');row?.scrollIntoView({block:'nearest',behavior:'smooth'});};
$('#sourceList').onclick=e=>{const row=e.target.closest('[data-source-id]');if(row)showMapSource(row.dataset.sourceId);};
$('#clearSearchHistory').onclick=clearSavedSearchHistory;$('#searchHistoryList').onclick=e=>{const button=e.target.closest('[data-history-index]');if(!button)return;const question=searchHistory[Number(button.dataset.historyIndex)];if(!question)return;input.value=question;input.dispatchEvent(new Event('input'));input.focus();$('#sidebar').classList.remove('open');};
$('#mobileMenu').onclick=()=>$('#sidebar').classList.toggle('open');$('#collapseInspector').onclick=()=>$('#inspector').classList.toggle('collapsed');
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#newChat').click();input.focus();}if(e.key==='Escape'){$('#modalBackdrop').classList.remove('open');$('#aiBackdrop').classList.remove('open');$('#sidebar').classList.remove('open');}});
const drop=$('#dropZone');for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragover');});for(const event of ['dragleave','drop'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('dragover');});drop.addEventListener('drop',e=>{if(e.dataTransfer.files.length)addFiles([...e.dataTransfer.files]);});
renderSources();
populatePreferenceForm();
refreshModelStatus();
