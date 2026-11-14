const {JSDOM,VirtualConsole}=require('jsdom');
const {indexedDB}=require('fake-indexeddb');
const fs=require('fs'),assert=require('node:assert/strict');
const dir=require('node:path').resolve(__dirname,'../docs');
const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{url:'https://orbit.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,d=w.document;
w.indexedDB=indexedDB;w.structuredClone=structuredClone;w.confirm=()=>true;
w.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},fillRect(){},strokeRect(){}});
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
w.HTMLDialogElement.prototype.close=function(){this.open=false};
w.HTMLElement.prototype.setPointerCapture=()=>{};
Object.defineProperty(d.querySelector('#canvas'),'clientWidth',{value:1200});
Object.defineProperty(d.querySelector('#canvas'),'clientHeight',{value:760});
Object.defineProperty(w.HTMLElement.prototype,'offsetHeight',{get(){return this.classList.contains('hub')?265:240}});
w.eval(fs.readFileSync(dir+'/app.js','utf8')+'\nwindow.runOrbit=(code)=>eval(code);');
const run=code=>w.runOrbit(code),q=s=>d.querySelector(s),click=s=>q(s).click();
const submit=s=>q(s).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
const wait=()=>new Promise(r=>setTimeout(r,30));
(async()=>{
await wait();assert.equal(d.querySelectorAll('.node').length,5);assert.equal(d.querySelectorAll('.edge-path').length,4);
assert.equal(run('board().name'),'Мій проєкт');assert(w.localStorage.getItem('orbit.workspace.v1'));
// Create, edit, delete, undo, content escaping.
click('#add-block');q('#block-title').value='<img src=x onerror=alert(1)>';q('#block-text').value='Перша думка';submit('#editor-form');await wait();
assert.equal(d.querySelectorAll('.node').length,6);assert(!q('#nodes img'));assert.equal(run('board().nodes.at(-1).text'),'Перша думка');
run("openEditor('note',board().nodes.at(-1).id)");q('#block-title').value='Тестова нотатка';q('#block-text').value='Оновлено';submit('#editor-form');await wait();assert.equal(run('board().nodes.at(-1).text'),'Оновлено');
run('deleteNode(board().nodes.at(-1).id)');assert.equal(run('board().nodes.length'),5);click('#undo');assert.equal(run('board().nodes.length'),6);
// Task toggle persists.
const box=q('[data-id="tasks"] [data-task="1"]');box.click();assert.equal(run('board().nodes.find(n=>n.id==="tasks").tasks[1].done'),true);
// Connect and disconnect.
run("setTool('connect');connect('vision');connect('resources')");assert.equal(run('board().edges.length'),5);
run("connect('resources');connect('vision')");assert.equal(run('board().edges.length'),4);
// Search across boards.
click('#search-open');q('#search-query').value='Оновлено';q('#search-query').dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.search-result').length,1);q('.search-result').click();assert(!q('#search-dialog').open);
// New board, empty state, rename, switch.
click('#new-board');q('#board-name').value='Друга дошка';submit('#board-form');assert.equal(run('state.boards.length'),2);assert.equal(run('board().nodes.length'),0);assert(!q('#empty-state').classList.contains('hidden'));
click('#rename-board');q('#board-name').value='Робоча дошка';submit('#board-form');assert.equal(q('#board-title').textContent,'Робоча дошка');
run("switchBoard('project')");await wait();assert.equal(run('board().nodes.length'),6);
// Link URL rejects javascript: and valid links are safe.
assert.equal(run("safeUrl('javascript:alert(1)')"),null);assert.equal(run("safeUrl('https://example.com/')"),'https://example.com/');
// Theme, responsive drawer, zoom.
click('#theme-toggle');assert.equal(d.body.dataset.theme,'light');click('#mobile-menu');assert(q('#sidebar').classList.contains('open'));click('#sidebar-backdrop');assert(!q('#sidebar').classList.contains('open'));
const z=run('view.z');click('#zoom-in');assert(run('view.z')>z);click('#fit-view');assert(Number.isFinite(run('view.x')));
// Export and reimport preserving all graph links and generating fresh IDs.
w.exportBlob=null;run('download=(blob,name)=>{window.exportBlob=blob;window.exportName=name}');await q('#export-board').onclick();assert(w.exportBlob);assert(w.exportName.endsWith('.orbit.json'));
const exportText=await new Promise((resolve,reject)=>{const r=new w.FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsText(w.exportBlob)});
const parsed=JSON.parse(exportText);assert.equal(parsed.board.nodes.length,6);assert.equal(parsed.board.edges.length,4);
await q('#import-file').onchange({target:{files:[{size:exportText.length,text:async()=>exportText}],value:'x'}});await wait();assert.equal(run('state.boards.length'),3);assert.equal(run('board().edges.length'),4);assert(!run('board().nodes.some(n=>n.id==="vision")'));
// Persisted reload state validates, viewport is finite.
assert(run('validWorkspace(JSON.parse(localStorage.getItem(STORAGE)))'));
assert(Number.isFinite(run('view.z')));
// IndexedDB persistence including file bytes.
w.testBlob=new Blob(['Orbit test file'],{type:'text/plain'});await run("putFile('qa-file',window.testBlob)");const blob=await run("getFile('qa-file')");assert.equal(await blob.text(),'Orbit test file');
assert.equal(errors.length,0,errors.map(e=>e.message).join('\n'));
console.log('PASS: initial graph, create/edit/delete/undo, XSS escaping, task persistence, connect/disconnect, search, multiple boards, URL checks, theme, mobile menu, zoom, JSON export/import, localStorage validation, IndexedDB file bytes.');
dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
