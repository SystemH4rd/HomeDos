/* Private Supabase workspace sync; local data remains available during failures. */
(function(){
'use strict';
const api=window.OrbitCanvas;if(!api)return;
let context=null,timer=null,applying=false;
const panel=document.createElement('div');panel.className='auth-state-label';panel.setAttribute('aria-live','polite');
const label=document.createElement('span'),retry=document.createElement('button');retry.type='button';retry.className='text-link';retry.textContent='Повторити синхронізацію';retry.hidden=true;
panel.append(label,document.createElement('br'),retry);document.querySelector('.sidebar-bottom').prepend(panel);
function status(c,text,action=false){if(context!==c)return;label.textContent=text;retry.hidden=!action;document.querySelector('#save-status').textContent=text;}
function key(c){return 'orbit.cloud.v1.'+c.user;}
function metadata(c){try{return JSON.parse(localStorage.getItem(key(c)))||{};}catch{return {};}}
function remember(c,workspace,revision){localStorage.setItem(key(c),JSON.stringify({revision,snapshot:JSON.stringify(workspace)}));}
function current(c){return context===c;}
function fileIds(workspace){return [...new Set(workspace.boards.flatMap(b=>b.nodes.map(n=>n.fileId).filter(Boolean)))];}
function path(c,id){if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw Error('invalid_file');return c.user+'/'+id;}
async function pull(c){
 status(c,'Завантаження з хмари…');
 const before=JSON.stringify(api.getWorkspace());
 const {data,error}=await c.client.from('orbit_workspaces').select('workspace,revision').eq('user_id',c.user).maybeSingle();
 if(!current(c))return;if(error)throw error;
 const local=api.getWorkspace(),meta=metadata(c),changed=JSON.stringify(local)!==before;
 if(data){
  if(!api.validWorkspace(data.workspace))throw Error('invalid_workspace');
  const dirty=meta.snapshot?JSON.stringify(local)!==meta.snapshot:!api.isStarter();
  if((dirty||changed)&&meta.revision!==data.revision){c.conflict=true;status(c,'Є зміни на іншому пристрої. Локальну копію збережено.',true);retry.textContent='Відкрити хмарну копію';return;}
  c.revision=data.revision;
  if(!dirty&&!changed){applying=true;try{api.replaceWorkspace(data.workspace);}finally{applying=false;}remember(c,data.workspace,data.revision);}
 }else c.revision=0;
 c.ready=true;c.dirty=JSON.stringify(api.getWorkspace())!==metadata(c).snapshot;
 if(c.dirty)await flush(c);else status(c,'Збережено онлайн');
}
async function flush(c){
 if(!current(c)||!c.ready||c.conflict||c.running)return;
 c.running=true;
 try{
  while(c.dirty&&current(c)){
   c.dirty=false;const workspace=api.getWorkspace();status(c,'Збереження онлайн…');
   // Files have immutable random IDs. Never publish a workspace before its files exist.
   for(const id of fileIds(workspace)){
    if(c.files.has(id))continue;const objectPath=path(c,id),blob=await api.getFile(id);
    if(!current(c))return;
    if(blob){const {error}=await c.client.storage.from('orbit-files').upload(objectPath,blob,{upsert:false,contentType:'application/octet-stream'});if(error&&String(error.statusCode)!=='409')throw error;}
    else{const {data,error}=await c.client.storage.from('orbit-files').download(objectPath);if(error||!data)throw error||Error('missing_file');}
    c.files.add(id);
   }
   if(!current(c))return;
   const {data,error}=await c.client.rpc('orbit_save_workspace',{p_workspace:workspace,p_expected_revision:c.revision});
   if(!current(c))return;if(error){if(error.code==='40001'){c.conflict=true;retry.textContent='Відкрити хмарну копію';status(c,'Конфлікт змін. Локальна копія збережена.',true);return;}throw error;}
   c.revision=Number(data);remember(c,workspace,c.revision);
   c.dirty=JSON.stringify(api.getWorkspace())!==JSON.stringify(workspace);
  }
  if(current(c))status(c,'Збережено онлайн');
 }catch{c.dirty=true;status(c,'Лише на пристрої — хмара недоступна',true);}
 finally{c.running=false;}
}
async function connect(client,user){
 clearTimeout(timer);const c={client,user,ready:false,dirty:false,revision:0,files:new Set(),running:false,conflict:false};context=c;retry.textContent='Повторити синхронізацію';
 try{await pull(c);}catch{status(c,'Лише на пристрої — перевірте підключення Supabase',true);}
}
async function disconnect(){const c=context;clearTimeout(timer);if(c)await flush(c);context=null;label.textContent='Без входу — збереження на пристрої';retry.hidden=true;}
document.addEventListener('orbit:save',()=>{const c=context;if(!c||applying)return;c.dirty=true;status(c,c.conflict?'Конфлікт змін — локальна копія збережена':'Збережено на пристрої; очікує хмари',c.conflict);clearTimeout(timer);timer=setTimeout(()=>flush(c),700);});
retry.onclick=async()=>{
 const c=context;if(!c)return;
 if(c.conflict){
  if(!confirm('Відкрити хмарну версію? Поточну локальну версію буде збережено окремим резервним JSON-файлом.'))return;
  try{const backup=await api.exportWorkspaceBackup();if(!current(c))return;
   if(JSON.stringify(backup.workspace)!==JSON.stringify(api.getWorkspace()))throw Error('workspace_changed');
   api.download(new Blob([JSON.stringify(backup)],{type:'application/json'}),'orbit-local-backup.json');
   localStorage.setItem(key(c)+'.backup',JSON.stringify(backup.workspace));
   const {data,error}=await c.client.from('orbit_workspaces').select('workspace,revision').eq('user_id',c.user).single();
   if(!current(c))return;if(error||!api.validWorkspace(data?.workspace))throw error||Error('invalid_workspace');
   if(JSON.stringify(backup.workspace)!==JSON.stringify(api.getWorkspace()))throw Error('workspace_changed');
   applying=true;try{api.replaceWorkspace(data.workspace);}finally{applying=false;}
   remember(c,data.workspace,data.revision);c.revision=data.revision;c.conflict=false;c.ready=true;c.dirty=false;retry.textContent='Повторити синхронізацію';status(c,'Збережено онлайн');
  }catch{status(c,'Не вдалося відкрити хмарну копію',true);}
 }else if(c.ready)await flush(c);else await connect(c.client,c.user);
};
window.addEventListener('online',()=>{if(context&&!context.conflict)retry.click();});
window.addEventListener('beforeunload',e=>{if(context&&(context.dirty||context.running)){e.preventDefault();e.returnValue='';}});
window.OrbitSync=Object.freeze({connect,disconnect,flush:()=>context?flush(context):Promise.resolve(),downloadFile:async id=>{
 const c=context;if(!c)return null;const {data,error}=await c.client.storage.from('orbit-files').download(path(c,id));if(error)throw error;if(!current(c))return null;await api.putFile(id,data);return data;
}});
label.textContent='Без входу — збереження на пристрої';
})();
