/* Real account authentication is handled exclusively by the configured Supabase project. */
(function(){
'use strict';
const api=window.OrbitCanvas;if(!api)return;
const $=s=>document.querySelector(s);
const userIcon='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>';
const sidebar=$('.sidebar-bottom');if(!sidebar)return;
const openButton=document.createElement('button');openButton.id='auth-open';openButton.className='nav-item auth-open';openButton.innerHTML=userIcon+'<span>Увійти / Реєстрація</span>';
const stateLabel=document.createElement('div');stateLabel.id='auth-state-label';stateLabel.className='auth-state-label';stateLabel.textContent='Гостьовий режим';
sidebar.insertBefore(openButton,sidebar.firstChild);openButton.after(stateLabel);
const dialog=document.createElement('dialog');dialog.id='auth-dialog';dialog.className='modal auth-modal';
dialog.innerHTML='<form id="auth-form"><div class="modal-head"><div><span class="eyebrow">ВАШ ОБЛІКОВИЙ ЗАПИС</span><h2 id="auth-heading">Увійти в Orbit</h2></div><button type="button" class="btn icon-btn" id="auth-close" aria-label="Закрити">✕</button></div><div class="auth-tabs" id="auth-tabs"><button type="button" data-auth-mode="login" class="active">Увійти</button><button type="button" data-auth-mode="register">Реєстрація</button></div><div class="modal-body"><div id="auth-message" class="auth-message hidden" role="status" aria-live="polite"></div><div id="auth-account" class="hidden"><div class="auth-account-card"><span class="avatar" id="auth-avatar">Я</span><div><strong id="auth-display-name"></strong><small id="auth-display-email"></small></div></div></div><p class="auth-note" id="auth-note">Після входу дошки та вкладення зберігаються онлайн у вашому профілі. Без входу — лише в цьому браузері.</p><div class="field hidden" id="auth-name-field"><label for="auth-name">Ім’я (необов’язково)</label><input id="auth-name" maxlength="80" autocomplete="name" placeholder="Як до вас звертатися"></div><div class="field" id="auth-email-field"><label for="auth-email">Електронна пошта</label><input id="auth-email" type="email" maxlength="254" autocomplete="email" required placeholder="you@example.com"></div><div class="field" id="auth-password-field"><label for="auth-password" id="auth-password-label">Пароль</label><input id="auth-password" type="password" autocomplete="current-password" required maxlength="128"><small class="auth-password-hint hidden" id="auth-password-hint">Щонайменше 10 символів. Не використовуйте пароль від інших сервісів.</small></div><div class="field hidden" id="auth-confirm-field"><label for="auth-confirm">Повторіть пароль</label><input id="auth-confirm" type="password" autocomplete="new-password" maxlength="128"></div><div class="auth-footer-links" id="auth-links"><button type="button" id="auth-forgot">Забули пароль?</button><button type="button" id="auth-back" class="hidden">Назад до входу</button></div></div><div class="modal-footer"><button type="button" class="btn ghost" id="auth-logout" hidden>Вийти</button><button type="button" class="btn ghost" id="auth-dismiss">Продовжити без входу</button><button type="submit" class="btn primary" id="auth-submit">Увійти</button></div></form>';
document.body.append(dialog);
let client=null,configured=false,configurationError='',mode='login',currentUser=null,busy=false,validationTicket=0,scopeUserId=null,scopeQueue=Promise.resolve();
const callbackUrl=()=>{const u=new URL(location.href);u.search='';u.hash='';return u.href;};
function publicConfig(config){
 if(!config||!config.url||!config.publishableKey)return null;
 let url;try{url=new URL(config.url);}catch{throw Error('invalid_config');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw Error('invalid_config');
 const key=String(config.publishableKey).trim();
 if(key.startsWith('sb_secret_'))throw Error('secret_key');
 if(!key.startsWith('sb_publishable_')){
  try{const payload=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role!=='anon')throw Error('secret_key');}catch{throw Error('invalid_public_key');}
 }
 return {url:url.origin,key};
}
function message(text,kind='info'){const el=$('#auth-message');el.textContent=text;el.dataset.kind=kind;el.classList.toggle('hidden',!text);}
function describeError(error){
 const code=error?.code,status=error?.status;
 if(code==='invalid_credentials')return 'Неправильна пошта або пароль. Перевірте дані та спробуйте знову.';
 if(code==='email_not_confirmed')return 'Спочатку підтвердьте електронну пошту за посиланням у листі.';
 if(code==='user_already_exists'||code==='email_exists')return 'Спробуйте увійти або відновити пароль для цієї пошти.';
 if(code==='weak_password')return 'Пароль надто простий. Спробуйте довший і складніший пароль.';
 if(status===429||code==='over_email_send_rate_limit'||code==='over_request_rate_limit')return 'Забагато спроб. Зачекайте трохи та повторіть.';
 if(code==='signup_disabled')return 'Нову реєстрацію тимчасово вимкнено власником сайту.';
 if(code==='otp_expired'||code==='flow_state_expired'||code==='bad_code_verifier')return 'Посилання втратило чинність. Надішліть новий запит на відновлення пароля.';
 if(!navigator.onLine||error?.name==='AuthRetryableFetchError'||error?.name==='TypeError')return 'Не вдалося з’єднатися із сервісом облікових записів. Перевірте інтернет і спробуйте знову.';
 return 'Не вдалося виконати дію. Перевірте дані та спробуйте знову.';
}
function updateProfile(){
 const name=currentUser?.user_metadata?.display_name||currentUser?.email||'Обліковий запис';
 openButton.querySelector('span').textContent=currentUser?'Мій обліковий запис':'Увійти / Реєстрація';
 stateLabel.textContent=currentUser?'Вхід: '+(currentUser.email||name):'Гостьовий режим';
 const profileName=$('.profile strong');if(profileName){profileName.textContent=currentUser?name:'Особистий простір';profileName.classList.add('auth-profile-name');}
 $('#auth-display-name').textContent=name;$('#auth-display-email').textContent=currentUser?.email||'';$('#auth-avatar').textContent=String(name).trim().slice(0,1).toLocaleUpperCase('uk')||'Я';
}
function render(){
 const account=mode==='account'&&!!currentUser,register=mode==='register',reset=mode==='reset',forgot=mode==='forgot';
 $('#auth-heading').textContent=account?'Мій обліковий запис':register?'Створити обліковий запис':reset?'Новий пароль':forgot?'Відновити пароль':'Увійти в Orbit';
 $('#auth-tabs').classList.toggle('hidden',account||reset||forgot);
 dialog.querySelectorAll('[data-auth-mode]').forEach(b=>b.classList.toggle('active',b.dataset.authMode===mode));
 $('#auth-account').classList.toggle('hidden',!account);
 $('#auth-name-field').classList.toggle('hidden',!register);$('#auth-name').disabled=busy||!configured||!register;
 $('#auth-email-field').classList.toggle('hidden',account||reset);$('#auth-email').disabled=busy||!configured||account||reset;$('#auth-email').required=!account&&!reset;
 $('#auth-password-field').classList.toggle('hidden',account||forgot);$('#auth-password').disabled=busy||!configured||account||forgot;$('#auth-password').required=!account&&!forgot;$('#auth-password').minLength=register||reset?10:1;$('#auth-password').autocomplete=register||reset?'new-password':'current-password';
 $('#auth-password-label').textContent=reset?'Новий пароль':'Пароль';$('#auth-password-hint').classList.toggle('hidden',!register&&!reset);
 $('#auth-confirm-field').classList.toggle('hidden',!register&&!reset);$('#auth-confirm').disabled=busy||!configured||(!register&&!reset);$('#auth-confirm').required=register||reset;
 $('#auth-links').classList.toggle('hidden',account||register||reset);$('#auth-forgot').classList.toggle('hidden',forgot);$('#auth-back').classList.toggle('hidden',!forgot);
 $('#auth-submit').classList.toggle('hidden',account);$('#auth-submit').disabled=busy||!configured;$('#auth-submit').textContent=busy?'Зачекайте…':register?'Зареєструватися':reset?'Зберегти пароль':forgot?'Надіслати лист':'Увійти';
 $('#auth-logout').hidden=!account;$('#auth-logout').disabled=busy;$('#auth-dismiss').textContent=account||reset?'Закрити':'Продовжити без входу';
 dialog.querySelectorAll('[data-auth-mode]').forEach(b=>b.disabled=busy);
 if(!configured)message(configurationError||'Реєстрація ще не налаштована. Власник сайту ще не підключив сервіс облікових записів. Дошкою можна користуватися без входу.','info');
 updateProfile();
}
function setMode(next,clear=true){mode=next;$('#auth-password').value='';$('#auth-confirm').value='';if(clear)message('');render();}
function open(next){api.closeNavigation?.();setMode(next||(currentUser?'account':'login'));if(!dialog.open)dialog.showModal();if(configured)setTimeout(()=>{const input=mode==='reset'?$('#auth-password'):$('#auth-email');if(!input.disabled)input.focus();},0);}
function clearPasswords(){$('#auth-password').value='';$('#auth-confirm').value='';}
function dismiss(){dialog.close();clearPasswords();}
openButton.onclick=()=>open();$('#auth-close').onclick=$('#auth-dismiss').onclick=dismiss;
dialog.addEventListener('close',clearPasswords);dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dismiss();}});
dialog.querySelectorAll('[data-auth-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.authMode));$('#auth-forgot').onclick=()=>setMode('forgot');$('#auth-back').onclick=()=>setMode('login');
function applyUser(user,event,ticket=validationTicket){
 scopeQueue=scopeQueue.catch(()=>{}).then(async()=>{
  if(ticket!==validationTicket)return;
  const nextId=user?.id||null;if(nextId!==scopeUserId){await window.OrbitShared?.disconnect();await window.OrbitSync?.disconnect();await api.activateUser(nextId);scopeUserId=nextId;if(nextId){await window.OrbitSync?.connect(client,nextId);await window.OrbitShared?.connect(client,nextId,user?.user_metadata?.display_name||'Учасник');}}
  if(ticket!==validationTicket)return;
  currentUser=user||null;updateProfile();if(event==='PASSWORD_RECOVERY'){open('reset');return;}if(dialog.open){if(currentUser&&mode!=='reset')mode='account';if(!currentUser&&mode==='account')mode='login';render();}
 });
 return scopeQueue;
}
async function verifySession(session,event){
 const ticket=++validationTicket;
 if(!session){if(ticket===validationTicket)await applyUser(null,event,ticket);return;}
 const {data,error}=await client.auth.getUser();if(ticket!==validationTicket)return;
 if(error||!data?.user){await applyUser(null,event,ticket);if(dialog.open)message('Сесію не вдалося підтвердити. Увійдіть повторно.','error');return;}
 await applyUser(data.user,event,ticket);
}
$('#auth-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||!configured||!client)return;
 const email=$('#auth-email').value.trim(),password=$('#auth-password').value;
 if((mode==='register'||mode==='reset')&&(password.length<10||password!==$('#auth-confirm').value)){message(password.length<10?'Використайте пароль щонайменше з 10 символів.':'Паролі не збігаються.','error');return;}
 busy=true;message('');render();
 try{
  if(mode==='register'){
   const {data,error}=await client.auth.signUp({email,password,options:{data:{display_name:$('#auth-name').value.trim()},emailRedirectTo:callbackUrl()}});if(error)throw error;
   clearPasswords();if(data?.session){await verifySession(data.session,'SIGNED_IN');if(currentUser){dismiss();api.notify('Обліковий запис створено. Ви увійшли в Orbit.');}}else{setMode('login');message('Перевірте пошту: якщо реєстрація можлива, ви отримаєте лист із посиланням для підтвердження. Після підтвердження поверніться та увійдіть.','success');}
  }else if(mode==='login'){
   const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;await verifySession(data.session,'SIGNED_IN');if(currentUser){dismiss();api.notify('Вхід виконано. Відкрито дошки вашого профілю.');}
  }else if(mode==='forgot'){
   const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:callbackUrl()});if(error)throw error;message('Якщо обліковий запис існує, на цю пошту надійде лист для відновлення пароля. Відкрийте посилання в цьому браузері.','success');
  }else if(mode==='reset'){
   const {error}=await client.auth.updateUser({password});if(error)throw error;clearPasswords();setMode('account');message('Пароль оновлено.','success');
  }
 }catch(error){message(describeError(error),'error');}finally{busy=false;render();}
});
$('#auth-logout').onclick=async()=>{if(busy||!client)return;busy=true;render();try{const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;++validationTicket;await applyUser(null,'SIGNED_OUT');dismiss();api.notify('Ви вийшли. Відкрито гостьові дошки.');}catch(error){message(describeError(error),'error');}finally{busy=false;render();}};
let sdkLoadPromise=null;
function loadSupabase(){
 if(window.supabase?.createClient)return Promise.resolve();
 if(sdkLoadPromise)return sdkLoadPromise;
 sdkLoadPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.async=true;script.src=new URL('vendor/supabase.js',document.baseURI).href;script.dataset.orbitAuthSdk='';
  const finish=(error)=>{clearTimeout(timeout);script.onload=null;script.onerror=null;if(error){script.remove();reject(error);}else resolve();};
  const timeout=setTimeout(()=>finish(Error('sdk_timeout')),15000);
  script.onload=()=>finish(window.supabase?.createClient?null:Error('sdk_invalid'));
  script.onerror=()=>finish(Error('sdk_load_failed'));
  document.head.append(script);
 });
 return sdkLoadPromise;
}
async function initialize(){
 let config;try{config=publicConfig(window.ORBIT_AUTH_CONFIG);}catch{configurationError='Реєстрація ще не налаштована: помилка підключення сервісу. Дошкою можна користуватися без входу.';render();return;}
 if(!config){render();return;}
 configurationError='Завантаження сервісу облікових записів…';render();
 try{await loadSupabase();}catch{configurationError='Сервіс облікових записів не завантажився. Оновіть сторінку, щоб спробувати ще раз. Дошкою можна користуватися без входу.';configured=false;render();return;}
 configurationError='';
 try{
  client=window.supabase.createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'orbit.supabase.auth.'+new URL(config.url).hostname}});configured=true;
  client.auth.onAuthStateChange((event,session)=>{if(event==='INITIAL_SESSION')return;setTimeout(()=>verifySession(session,event).catch(()=>{if(dialog.open)message('Не вдалося відновити вхід. Спробуйте увійти ще раз.','error');}),0);});
  const {data,error}=await client.auth.getSession();if(error)throw error;await verifySession(data?.session,'INITIAL_SESSION');
 }catch(error){message(describeError(error),'error');}
 render();
}
window.OrbitAuth={open,isConfigured:()=>configured,getUser:()=>currentUser};
initialize();
})();
