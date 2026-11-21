/* Shared contributions are separate from every private workspace and bucket. */
(function(){
'use strict';const api=window.OrbitCanvas;if(!api)return;
let context=null,poll=null,timer=null;
const button=document.createElement('button');button.className='nav-item';button.id='shared-board-open';button.textContent='Спільна';button.hidden=true;document.querySelector('#board-list').after(button);
const banner=document.createElement('div');banner.className='shared-banner';banner.hidden=true;
const reload=document.createElement('button');reload.type='button';reload.className='text-link';reload.textContent='Відкрити хмарну версію';reload.hidden=true;
const message=document.createElement('span'),retry=document.createElement('button');retry.className='text-link';retry.type='button';retry.textContent='Оновити / повторити';banner.append(message,retry,reload);document.querySelector('#canvas').append(banner);
const current=c=>context===c;
const active=()=>!!context&&api.isExternalBoard();
const status=(c,text)=>{if(current(c)){message.textContent=text;if(active())document.querySelector('#save-status').textContent=text;}};
const draftKey=c=>'orbit.shared.draft.v1.'+c.user;
function clean(n){const copy=JSON.parse(JSON.stringify(n));delete copy.sharedOwner;delete copy.sharedAuthor;return copy;}
const signature=n=>JSON.stringify(clean(n));
function remember(c){try{localStorage.setItem(draftKey(c),JSON.stringify({nodes:c.board.nodes.filter(n=>!n.sharedOwner||n.sharedOwner===c.user).map(clean),base:Object.fromEntries(Array.from(c.rows).filter(([,r])=>r.owner_id===c.user).map(([id,r])=>[id,r.revision]))}));}catch{api.notify('Не вдалося зберегти чернетку. Не закривайте сторінку до запису онлайн.');}}
function ownNodes(c){return c.board.nodes.filter(n=>!n.sharedOwner||n.sharedOwner===c.user);}
function decorate(row){return {...row.node,sharedOwner:row.owner_id,sharedAuthor:row.author_name||'Учасник'};}
async function load(c){
 if(!current(c)||c.loading||c.saving||c.dirty||api.isInteracting())return;c.loading=true;
 try{const rows=[];let offset=0;while(true){const {data,error}=await c.client.from('orbit_shared_nodes').select('id,owner_id,author_name,node,revision').order('id').range(offset,offset+499);if(!current(c))return;if(error)throw error;rows.push(...data);if(data.length<500)break;offset+=500;}
 if(c.dirty||api.isInteracting())return;
 const valid=rows.filter(row=>api.validWorkspace({version:1,boards:[{id:'validate',name:'Спільна',nodes:[row.node],edges:[]}]}));
 c.rows=new Map(valid.map(r=>[r.id,r]));const nodes=valid.map(decorate);
 if(!c.loaded){let draft;try{draft=JSON.parse(localStorage.getItem(draftKey(c)));}catch{}if(draft&&Array.isArray(draft.nodes)&&api.validWorkspace({version:1,boards:[{id:'draft',name:'Спільна',nodes:draft.nodes,edges:[]}]})){const draftIds=new Set(draft.nodes.map(n=>n.id));for(let i=nodes.length-1;i>=0;i--)if(nodes[i].sharedOwner===c.user&&draft.base?.[nodes[i].id]!==undefined&&!draftIds.has(nodes[i].id))nodes.splice(i,1);for(const [id,row] of c.rows)if(row.owner_id===c.user&&draft.base?.[id]!==undefined)row.revision=draft.base[id];for(const n of draft.nodes){const i=nodes.findIndex(x=>x.id===n.id);if(i<0)nodes.push({...n,sharedOwner:c.user,sharedAuthor:c.name});else if(nodes[i].sharedOwner===c.user)nodes[i]={...n,sharedOwner:c.user,sharedAuthor:c.name};}c.dirty=true;}}
 c.board.nodes=nodes;c.loaded=true;if(active())api.refreshExternalBoard(c.board);status(c,'Спільна для всіх учасників · кожен змінює свої записи');
 if(c.dirty)await flush(c);
 }catch{status(c,'Не вдалося завантажити спільну дошку. Перевірте інтернет.');}finally{c.loading=false;}
}
async function flush(c){
 if(!current(c)||!c.loaded||c.saving||!c.dirty)return;c.saving=true;
 try{while(c.dirty&&current(c)){c.dirty=false;const nodes=ownNodes(c).map(clean),ids=new Set(nodes.map(n=>n.id));status(c,'Збереження спільних записів…');
 for(const n of nodes){const before=c.rows.get(n.id);if(before&&signature(before.node)===signature(n))continue;
 if(n.fileId){const path=c.user+'/'+n.fileId;if(!/^[a-zA-Z0-9_-]{1,128}$/.test(n.fileId))throw Error('invalid_file');if(!c.files.has(n.fileId)){const blob=await api.getFile(n.fileId);if(!current(c))return;if(blob){const {error}=await c.client.storage.from('orbit-shared-files').upload(path,blob,{upsert:false,contentType:'application/octet-stream'});if(error&&String(error.statusCode)!=='409')throw error;}else{const {error}=await c.client.storage.from('orbit-shared-files').download(path);if(error)throw error;}c.files.add(n.fileId);}}
 if(!current(c))return;
 const revision=(before?.revision||0)+1;
 const query=before?c.client.from('orbit_shared_nodes').update({node:n,revision,updated_at:new Date().toISOString()}).eq('id',n.id).eq('revision',before.revision).select():c.client.from('orbit_shared_nodes').insert({id:n.id,owner_id:c.user,author_name:c.name,node:n}).select();
 const {data,error}=await query;if(!current(c))return;if(error||!data?.length)throw Error('conflict');c.rows.set(n.id,data[0]);
 }
 for(const [id,row]of c.rows){if(row.owner_id!==c.user||ids.has(id))continue;const {data,error}=await c.client.from('orbit_shared_nodes').delete().eq('id',id).eq('revision',row.revision).select();if(!current(c))return;if(error||!data?.length)throw Error('conflict');c.rows.delete(id);}
 if(current(c)){if(!c.dirty)localStorage.removeItem(draftKey(c));reload.hidden=true;status(c,'Спільна · зміни збережено онлайн');}
 }}catch{c.dirty=true;remember(c);reload.hidden=false;status(c,'Чернетку збережено на пристрої. Немає мережі або запис змінено в іншій вкладці.');}
 finally{c.saving=false;}
}
function save(){const c=context;if(!c||!active())return;for(const n of c.board.nodes)if(!n.sharedOwner){n.sharedOwner=c.user;n.sharedAuthor=c.name;const index=c.board.nodes.indexOf(n);n.x=(index%3)*330;n.y=Math.floor(index/3)*470;}c.dirty=true;remember(c);status(c,'Спільна · очікує збереження онлайн');clearTimeout(timer);timer=setTimeout(()=>flush(c),500);}
async function open(){const c=context;if(!c)return;await window.OrbitSync?.flush();if(!current(c))return;button.disabled=true;try{if(!c.loaded)await load(c);if(!current(c))return;if(!c.loaded){api.notify('Не вдалося завантажити спільну дошку. Перевірте інтернет.');return;}api.setExternalBoard(c.board);await load(c);}finally{button.disabled=false;}}
async function disconnect(){const c=context;clearTimeout(timer);clearInterval(poll);if(c)await flush(c);context=null;button.hidden=true;banner.hidden=true;if(api.isExternalBoard())api.setExternalBoard(null);}
reload.onclick=async()=>{const c=context;if(!c||c.saving)return;if(!confirm('Відкрити актуальні записи з хмари? Вашу незбережену чернетку буде збережено окремою резервною копією на цьому пристрої.'))return;try{localStorage.setItem(draftKey(c)+'.backup',JSON.stringify(ownNodes(c).map(clean)));localStorage.removeItem(draftKey(c));c.dirty=false;reload.hidden=true;await load(c);}catch{status(c,'Не вдалося зберегти резервну чернетку.');}};
button.onclick=open;retry.onclick=async()=>{const c=context;if(!c)return;if(c.dirty)await flush(c);else await load(c);};
document.addEventListener('orbit:render',()=>{banner.hidden=!active();document.querySelector('#canvas').classList.toggle('shared-active',active());document.querySelector('[data-tool="connect"]').disabled=active();if(active())document.querySelector('#save-status').textContent=message.textContent;button.classList.toggle('active',active());document.querySelector('#rename-board').hidden=active();document.querySelector('#undo').disabled=active();});
window.addEventListener('online',()=>retry.click());document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active())retry.click();});
window.addEventListener('beforeunload',e=>{if(context&&(context.dirty||context.saving)){e.preventDefault();e.returnValue='';}});
window.OrbitShared=Object.freeze({connect:async(client,user,name)=>{const c={client,user,name:String(name).slice(0,80),board:{id:'orbit-shared',name:'Спільна',nodes:[],edges:[]},rows:new Map(),files:new Set(),loaded:false,dirty:false,saving:false,loading:false};context=c;button.hidden=false;clearInterval(poll);poll=setInterval(()=>{if(active()&&!document.hidden)load(c);},10000);},disconnect,open,save,flush:()=>context?flush(context):Promise.resolve(),canEdit:n=>!!context&&(!n?.sharedOwner||n.sharedOwner===context.user),hasFile:id=>active()&&context.board.nodes.some(n=>n.fileId===id),downloadFile:async id=>{const c=context,n=c?.board.nodes.find(n=>n.fileId===id);if(!n||!current(c))return null;const {data,error}=await c.client.storage.from('orbit-shared-files').download((n.sharedOwner||c.user)+'/'+id);if(error)throw error;if(!current(c))return null;await api.putFile(id,data);return data;}});
})();
