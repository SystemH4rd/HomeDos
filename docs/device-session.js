/* Default to a browser-session token until the user trusts this device. No passwords stored. */
(function(){
'use strict';let base='',preference='',user=null;const memory=new Map(),volatile=new Set();
const $=s=>document.querySelector(s);
function remembered(){try{return localStorage.getItem(preference)==='yes';}catch{return false;}}
function stores(){return ['sessionStorage','localStorage'].map(name=>{try{return window[name];}catch{return null;}}).filter(Boolean);}
function backend(){return remembered()?localStorage:sessionStorage;}
const storage={getItem:key=>{if(volatile.has(key))return memory.get(key)||null;try{return backend().getItem(key);}catch{return memory.get(key)||null;}},setItem:(key,value)=>{memory.set(key,value);try{backend().setItem(key,value);volatile.delete(key);}catch{volatile.add(key);}},removeItem:key=>{memory.delete(key);volatile.delete(key);for(const s of stores())try{s.removeItem(key);}catch{}}};
function keys(){const result=new Set(Array.from(memory.keys()).filter(k=>k.startsWith(base)));for(const s of stores())try{for(let i=0;i<s.length;i++){const k=s.key(i);if(k?.startsWith(base))result.add(k);}}catch{}return result;}
function setRemember(value){
 const values=new Map();for(const k of keys()){let value=storage.getItem(k);if(value===null)for(const s of stores())try{value=s.getItem(k);if(value!==null)break;}catch{}values.set(k,value);if(value!==null)memory.set(k,value);}
 // Retain a session copy until every persistent write succeeds.
 for(const [k,v]of values)if(v!==null)try{sessionStorage.setItem(k,v);volatile.delete(k);}catch{volatile.add(k);}
 if(value){try{for(const [k,v]of values)if(v!==null)localStorage.setItem(k,v);localStorage.setItem(preference,'yes');for(const k of values.keys())volatile.delete(k);}catch(error){for(const k of values.keys())try{localStorage.removeItem(k);}catch{}try{localStorage.setItem(preference,'no');}catch{}throw error;}for(const k of values.keys())try{sessionStorage.removeItem(k);}catch{}}
 else{try{localStorage.setItem(preference,'no');}catch{}for(const k of values.keys())try{localStorage.removeItem(k);}catch{}}
 const choice=$('#remember-device-setting');if(choice)choice.checked=value;
}
const dialog=document.createElement('dialog');dialog.id='remember-device-dialog';dialog.className='modal remember-device-modal';dialog.setAttribute('aria-labelledby','remember-device-heading');dialog.innerHTML='<div class="modal-head"><h2 id="remember-device-heading">Залишатися авторизованим на цьому пристрої?</h2></div><div class="modal-body"><p>Якщо це ваш телефон або комп’ютер, можна відновлювати вхід після закриття браузера чи застосунку. Пароль не зберігається.</p><p class="tools-shortcuts">На чужому пристрої оберіть «Лише цей сеанс». Після виходу з акаунта збережений вхід буде видалено.</p><p id="remember-device-error" role="status"></p></div><div class="modal-footer"><button type="button" class="btn" id="remember-device-no">Лише цей сеанс</button><button type="button" class="btn primary" id="remember-device-yes">Так, це мій пристрій</button></div>';
document.body.append(dialog);
function choose(value){try{setRemember(value);dialog.close();}catch{$('#remember-device-error').textContent='Не вдалося зберегти налаштування. Вхід працюватиме в поточному сеансі.';}}
$('#remember-device-yes').onclick=()=>choose(true);$('#remember-device-no').onclick=()=>choose(false);
dialog.addEventListener('cancel',e=>{e.preventDefault();choose(false);});
function ask(nextUser){user=nextUser;if(!user)return;if(!dialog.open){$('#remember-device-error').textContent='';dialog.showModal();}}
function installSetting(){const target=$('#auth-account');if(!target||$('#remember-device-setting'))return;const label=document.createElement('label');label.className='device-choice';const input=document.createElement('input');input.type='checkbox';input.id='remember-device-setting';input.checked=remembered();input.onchange=()=>{try{setRemember(input.checked);}catch{input.checked=remembered();window.OrbitCanvas?.notify('Не вдалося зберегти вибір пристрою');}};label.append(input,document.createTextNode('Запам’ятовувати вхід на цьому пристрої'));target.append(label);}
document.addEventListener('orbit:profile',e=>{if(!e.detail?.signedIn){user=null;if(dialog.open)dialog.close();}});
window.OrbitSession=Object.freeze({configure:key=>{base=key;preference='orbit.device.remember.'+base;
 if(!remembered()){for(const k of keys())try{const value=sessionStorage.getItem(k)||localStorage.getItem(k);if(value!==null){sessionStorage.setItem(k,value);memory.set(k,value);localStorage.removeItem(k);}}catch{}}
 installSetting();return storage;},ask,setRemember,isRemembered:remembered,hasChoice:()=>{try{return ['yes','no'].includes(localStorage.getItem(preference));}catch{return false;}},close:()=>{user=null;if(dialog.open)dialog.close();}});
})();
