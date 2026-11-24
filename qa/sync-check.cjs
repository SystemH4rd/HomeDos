const {JSDOM}=require('jsdom'),{indexedDB}=require('fake-indexeddb');
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../docs'),copy=x=>JSON.parse(JSON.stringify(x));
// jsdom Blob lacks Node's structuredClone integration; retain these immutable fixture blobs.
const nativeClone=global.structuredClone;global.structuredClone=value=>Object.prototype.toString.call(value)==='[object Blob]'?value:nativeClone(value);
function mount(){
 const dom=new JSDOM(fs.readFileSync(root+'/index.html','utf8'),{url:'https://systemh4rd.github.io/HomeDos/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.indexedDB=indexedDB;w.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},fillRect(){},strokeRect(){}});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.eval(fs.readFileSync(root+'/app.js','utf8')+'\nwindow.editOrbit=code=>eval(code);');w.eval(fs.readFileSync(root+'/sync.js','utf8'));
 return {dom,w,edit:code=>w.editOrbit(code)};
}
function server(){
 const rows=new Map(),files=new Map(),calls=[];let fail=false,paused=null;
 const client={from:()=>({select:()=>({eq:(_,user)=>({maybeSingle:async()=>{if(paused)await paused;if(fail)return {error:{}};return {data:rows.get(user)?copy(rows.get(user)):null};},single:async()=>({data:copy(rows.get(user))})})})}),
 rpc:async(name,p)=>{calls.push(name);if(fail)return {error:{}};const user=client.user,row=rows.get(user);if((row?.revision||0)!==p.p_expected_revision)return {error:{code:'40001'}};const revision=(row?.revision||0)+1;rows.set(user,{workspace:copy(p.p_workspace),revision});return {data:revision};},
 storage:{from:()=>({upload:async(p,b)=>{if(fail)return {error:{}};if(files.has(p))return {error:{statusCode:'409'}};files.set(p,b);return {};},download:async p=>files.has(p)?{data:files.get(p)}:{error:{}}})}};
 return {client,rows,files,calls,set fail(v){fail=v},set paused(v){paused=v}};
}
(async()=>{
 const s=server();s.client.user='alice';let x=mount();x.w.OrbitCanvas.activateUser('alice');await x.w.OrbitSync.connect(s.client,'alice');assert.equal(s.rows.get('alice').revision,1);
 x.edit("board().name='Онлайн проєкт';save()");await x.w.OrbitSync.flush();assert.equal(s.rows.get('alice').workspace.boards[0].name,'Онлайн проєкт');assert.match(x.w.document.querySelector('#save-status').textContent,/онлайн/);
 // Attachment upload precedes publishing, and another browser can retrieve it.
 await x.w.OrbitCanvas.putFile('file-1',new x.w.Blob(['private bytes']));x.edit("board().nodes.push({id:'file-node',fileId:'file-1',fileName:'test.txt',type:'file',title:'Файл',x:0,y:0});save()");await x.w.OrbitSync.flush();assert(s.files.has('alice/file-1'));
 x.edit("deleteNode('file-node')");await x.w.OrbitSync.flush();assert.equal(s.rows.get('alice').workspace.boards[0].trash[0].node.fileId,'file-1');
 const backup=await x.w.OrbitCanvas.exportWorkspaceBackup();assert.equal(backup.files['file-1'].split(',')[1],Buffer.from('private bytes').toString('base64'));
 const restored=mount(),backupText=JSON.stringify(backup);await restored.w.document.querySelector('#import-file').onchange({target:{files:[{size:backupText.length,text:async()=>backupText}],value:'x'}});
 assert.equal(restored.w.OrbitCanvas.getWorkspace().boards.length,2);assert.equal(restored.w.OrbitCanvas.getBoard().name,'Онлайн проєкт (відновлено)');assert(await restored.w.OrbitCanvas.getFile(restored.w.OrbitCanvas.getBoard().trash[0].node.fileId));restored.dom.window.close();
 const y=mount();y.w.OrbitCanvas.activateUser('alice');await y.w.OrbitSync.connect(s.client,'alice');assert.equal(y.w.OrbitCanvas.getBoard().name,'Онлайн проєкт');assert(await y.w.OrbitSync.downloadFile('file-1'));assert.equal(y.w.OrbitCanvas.getBoard().trash[0].node.fileId,'file-1');
 x.edit('restoreTrash([0])');await x.w.OrbitSync.flush();assert(x.w.OrbitCanvas.getBoard().nodes.some(n=>n.id==='file-node'));

 // Network failure preserves edits; explicit retry publishes them.
 s.fail=true;x.edit("board().name='Без мережі';save()");await x.w.OrbitSync.flush();assert.equal(s.rows.get('alice').workspace.boards[0].name,'Онлайн проєкт');assert.match(x.w.document.querySelector('#save-status').textContent,/недоступна/);s.fail=false;await x.w.OrbitSync.flush();assert.equal(s.rows.get('alice').workspace.boards[0].name,'Без мережі');
 // A stale second device must never overwrite the first device's newer revision.
 y.edit("board().name='Інший пристрій';save()");await y.w.OrbitSync.flush();assert.equal(s.rows.get('alice').workspace.boards[0].name,'Без мережі');assert.equal(y.w.OrbitCanvas.getBoard().name,'Інший пристрій');assert.match(y.w.document.querySelector('#save-status').textContent,/Конфлікт/);
 y.w.confirm=()=>true;let downloaded=false;y.edit('download=()=>{}');
 // OrbitCanvas captures the original download function, so stub its browser URL API.
 y.w.URL.createObjectURL=()=>{downloaded=true;return 'blob:test'};y.w.URL.revokeObjectURL=()=>{};y.w.HTMLAnchorElement.prototype.click=()=>{};
 await y.w.document.querySelector('.auth-state-label .text-link').onclick();assert(downloaded);assert.equal(y.w.OrbitCanvas.getBoard().name,'Без мережі');assert(y.w.localStorage.getItem('orbit.cloud.v1.alice.backup'));

 await y.w.OrbitSync.disconnect();y.dom.window.close();
 // Logout restores the guest; a second account has no access to the first workspace.
 await x.w.OrbitSync.disconnect();x.w.OrbitCanvas.activateUser(null);assert.equal(x.w.OrbitCanvas.getBoard().name,'Мій проєкт');s.client.user='bob';x.w.OrbitCanvas.activateUser('bob');await x.w.OrbitSync.connect(s.client,'bob');assert.equal(s.rows.get('bob').workspace.boards[0].name,'Мій проєкт');assert.equal(s.rows.get('alice').workspace.boards[0].name,'Без мережі');
 await x.w.OrbitSync.disconnect();x.dom.window.close();
 // Returning with unsynced edits after another device saved produces a conflict.
 s.client.user='alice';x=mount();x.w.OrbitCanvas.activateUser('alice');await x.w.OrbitSync.connect(s.client,'alice');s.fail=true;x.edit("board().name='Незбережена зміна';save()");await x.w.OrbitSync.disconnect();s.fail=false;s.rows.get('alice').revision++;await x.w.OrbitSync.connect(s.client,'alice');assert.equal(x.w.OrbitCanvas.getBoard().name,'Незбережена зміна');assert.match(x.w.document.querySelector('#save-status').textContent,/іншому пристрої/);x.dom.window.close();
 console.log('PASS: cloud create/load/save, private attachments, offline retry, stale-device conflict, account separation and pending-edit recovery.');
})().catch(e=>{console.error(e);process.exitCode=1});
