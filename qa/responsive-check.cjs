/* Behavioral responsive checks, without a browser layout engine.
   NODE_PATH=/tmp/orbit-qa/node_modules node qa/responsive-check.cjs */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const { indexedDB } = require('fake-indexeddb');
const root = path.resolve(__dirname, '../docs');
const pause = (ms=70) => new Promise(resolve => setTimeout(resolve, ms));
const near = (actual, expected, message) => assert(Math.abs(actual-expected) < 0.001, `${message}: ${actual} vs ${expected}`);
function environment(initialWidth, initialHeight=760) {
  let width=initialWidth, height=initialHeight, canvasWidth=initialWidth, canvasHeight=initialHeight-70;
  const errors=[], vc=new VirtualConsole(); vc.on('jsdomError', error => errors.push(error));
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://systemh4rd.github.io/HomeDos/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
  const w=dom.window,d=w.document;
  Object.defineProperties(w,{innerWidth:{get:()=>width,configurable:true},innerHeight:{get:()=>height,configurable:true}});
  const media=new Map();
  function mediaMatches(query){const maximum=/max-width\s*:\s*(\d+)px/.exec(query),minimum=/min-width\s*:\s*(\d+)px/.exec(query);if(maximum)return width<=Number(maximum[1]);if(minimum)return width>=Number(minimum[1]);if(query.includes('pointer: coarse')||query.includes('pointer:coarse'))return width<=1024;return false;}
  w.matchMedia=query=>{if(media.has(query))return media.get(query);const handlers=new Set();const m={media:query,get matches(){return mediaMatches(query)},addEventListener:(type,fn)=>handlers.add(fn),removeEventListener:(type,fn)=>handlers.delete(fn),addListener:fn=>handlers.add(fn),removeListener:fn=>handlers.delete(fn),dispatch(){for(const fn of handlers)fn({matches:m.matches,media:query});}};media.set(query,m);return m;};
  const vv=new w.EventTarget();Object.assign(vv,{height,width,offsetTop:0,offsetLeft:0,scale:1});Object.defineProperty(w,'visualViewport',{value:vv,configurable:true});
  const resizeObservers=[];w.ResizeObserver=class{constructor(callback){this.callback=callback;resizeObservers.push(this);}observe(){}unobserve(){}disconnect(){}};
  w.indexedDB=indexedDB;w.confirm=()=>true;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  w.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},fillRect(){},strokeRect(){}});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const captures=new Set();w.HTMLElement.prototype.setPointerCapture=id=>captures.add(id);w.HTMLElement.prototype.hasPointerCapture=id=>captures.has(id);w.HTMLElement.prototype.releasePointerCapture=id=>captures.delete(id);
  const canvas=d.querySelector('#canvas');Object.defineProperties(canvas,{clientWidth:{get:()=>canvasWidth},clientHeight:{get:()=>canvasHeight}});canvas.getBoundingClientRect=()=>({left:0,top:0,width:canvasWidth,height:canvasHeight,right:canvasWidth,bottom:canvasHeight});
  Object.defineProperty(w.HTMLElement.prototype,'offsetHeight',{get(){return this.classList.contains('hub')?265:240}});Object.defineProperty(w.HTMLElement.prototype,'offsetWidth',{get(){return this.classList.contains('node')?286:0}});
  w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.runOrbit=code=>eval(code);');
  const run=code=>w.runOrbit(code),q=selector=>d.querySelector(selector);
  function pointer(target,type,id,x,y,pointerType='touch'){const event=new w.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:id,pointerType,clientX:x,clientY:y,button:0,isPrimary:id===1});target.dispatchEvent(event);}
  async function resize(nextWidth,nextHeight=height,nextCanvasWidth=nextWidth,nextCanvasHeight=nextHeight-70){width=nextWidth;height=nextHeight;canvasWidth=nextCanvasWidth;canvasHeight=nextCanvasHeight;vv.width=width;vv.height=height;for(const m of media.values())m.dispatch();w.dispatchEvent(new w.Event('resize'));vv.dispatchEvent(new w.Event('resize'));for(const observer of resizeObservers)observer.callback([{target:canvas,contentRect:{width:canvasWidth,height:canvasHeight}}]);await pause(230);}
  function inert(el){return el.inert===true||el.hasAttribute('inert');}
  function clean(){assert.equal(errors.length,0,errors.map(error=>error.message).join('\n'));dom.window.close();}
  return {w,d,canvas,run,q,pointer,resize,vv,inert,clean};
}
(async()=>{
  // Drawer state is tested at the same breakpoint as the CSS, including tablet widths.
  for(const width of [320,375,768,1024,1280]){
    const e=environment(width);await pause();const {q,w,inert}=e;const mobile=width<=1024;
    assert(q('#sidebar-close'),'drawer has an explicit close button');assert.equal(q('#mobile-menu').getAttribute('aria-controls'),'sidebar');assert.equal(q('#mobile-menu').getAttribute('aria-expanded'),'false');assert.equal(inert(q('#sidebar')),mobile,`hidden sidebar inert at ${width}`);assert(!inert(q('.main')));
    if(mobile){
      q('#mobile-menu').focus();q('#mobile-menu').click();assert.equal(q('#mobile-menu').getAttribute('aria-expanded'),'true');assert(q('#sidebar').classList.contains('open'));assert(!inert(q('#sidebar')));assert(inert(q('.main')));assert(q('#sidebar').contains(e.d.activeElement));
      w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(q('#mobile-menu').getAttribute('aria-expanded'),'false');assert(!q('#sidebar').classList.contains('open'));assert(inert(q('#sidebar')));assert(!inert(q('.main')));assert.equal(e.d.activeElement,q('#mobile-menu'));
      q('#mobile-menu').click();q('#sidebar-close').click();assert(!q('#sidebar').classList.contains('open'));assert.equal(e.d.activeElement,q('#mobile-menu'));
      q('#mobile-menu').click();q('#sidebar-backdrop').click();assert(!q('#sidebar').classList.contains('open'));
      q('#mobile-menu').click();q('#new-board').click();assert(q('#board-dialog').open);assert(!q('#sidebar').classList.contains('open'));assert(!inert(q('.main')));q('#board-dialog').close();
    }
    e.clean();
  }
  const e=environment(768);await pause();const {run,q,w,canvas,pointer}=e;
  // Pinching changes scale around the midpoint; moving both fingers also translates.
  run('view={x:10,y:20,z:1};transform()');
  pointer(canvas,'pointerdown',1,100,100);pointer(canvas,'pointerdown',2,300,100);pointer(canvas,'pointermove',2,340,100);
  near(run('view.z'),1.2,'pinch zoom');near(run('view.x'),-8,'pinch midpoint x');near(run('view.y'),4,'pinch midpoint y');
  pointer(canvas,'pointermove',1,120,130);pointer(canvas,'pointermove',2,360,130);
  near(run('view.z'),1.2,'two-finger translation keeps zoom');near(run('view.x'),12,'two-finger pan x');near(run('view.y'),34,'two-finger pan y');
  pointer(canvas,'pointerup',2,360,130);pointer(canvas,'pointermove',1,145,160);
  near(run('view.x'),37,'one finger continues panning x');near(run('view.y'),64,'one finger continues panning y');pointer(canvas,'pointerup',1,145,160);assert.equal(run('pointers.size'),0);assert.equal(run('gesture'),null);
  // Pinch gestures remain available while the connection tool is active.
  run("setTool('connect');view={x:0,y:0,z:1};transform()");
  pointer(q('[data-id="vision"] .node-body'),'pointerdown',1,100,100);pointer(q('[data-id="vision"] .node-body'),'pointerdown',2,300,100);pointer(canvas,'pointermove',2,340,100);
  near(run('view.z'),1.2,'connection mode still permits pinch');pointer(canvas,'pointerup',2,340,100);pointer(canvas,'pointerup',1,100,100);run("setTool('select')");
  // A touch on card content pans, while dragging its header moves that card.
  const beforeX=run('board().nodes[0].x');run('view={x:0,y:0,z:1};transform()');
  pointer(q('[data-id="vision"] .node-body'),'pointerdown',1,100,150);pointer(canvas,'pointermove',1,130,170);pointer(canvas,'pointerup',1,130,170);
  near(run('view.x'),30,'touching card body pans canvas');near(run('view.y'),20,'touching card body pans canvas y');assert.equal(run('board().nodes[0].x'),beforeX);
  pointer(q('[data-id="vision"] .node-head'),'pointerdown',1,100,150);pointer(canvas,'pointermove',1,140,180);near(run('board().nodes[0].x'),beforeX+40,'header moves node');
  // Starting a pinch midway through node drag saves the already completed move.
  pointer(canvas,'pointerdown',2,300,180);const saved=JSON.parse(w.localStorage.getItem('orbit.workspace.v1'));near(saved.boards[0].nodes[0].x,beforeX+40,'node drag persisted on pinch transition');pointer(canvas,'pointercancel',2,300,180);pointer(canvas,'pointercancel',1,140,180);assert.equal(run('pointers.size'),0);assert.equal(run('gesture'),null);
  // Resize/orientation changes preserve the user's zoom and central world coordinate.
  run('view={x:50,y:70,z:1.35};transform()');const worldBefore=run("({x:($('#canvas').clientWidth/2-view.x)/view.z,y:($('#canvas').clientHeight/2-view.y)/view.z})");
  await e.resize(1024,800,1024,730);near(run('view.z'),1.35,'resize preserves zoom');near(run("($('#canvas').clientWidth/2-view.x)/view.z"),worldBefore.x,'resize preserves center x');near(run("($('#canvas').clientHeight/2-view.y)/view.z"),worldBefore.y,'resize preserves center y');
  // The on-screen keyboard changes dialog height without fitting or moving the board.
  run("openEditor('note')");await pause();const beforeKeyboard=run('({...view})');e.vv.height=370;e.vv.offsetTop=24;e.vv.dispatchEvent(new w.Event('resize'));await pause();assert.equal(e.d.documentElement.style.getPropertyValue('--visual-height'),'370px');assert.equal(e.d.documentElement.style.getPropertyValue('--visual-top'),'24px');near(run('view.z'),beforeKeyboard.z,'keyboard keeps zoom');near(run('view.x'),beforeKeyboard.x,'keyboard keeps x');near(run('view.y'),beforeKeyboard.y,'keyboard keeps y');
  // Some mobile browsers also shrink the actual layout viewport while editing.
  // Keep the pre-keyboard baseline so closing the dialog cannot introduce a jump.
  await e.resize(1024,440,1024,370);
  near(run('view.x'),beforeKeyboard.x,'layout keyboard shrink keeps x');near(run('view.y'),beforeKeyboard.y,'layout keyboard shrink keeps y');near(run('view.z'),beforeKeyboard.z,'layout keyboard shrink keeps zoom');
  q('#editor').close();q('#add-block').focus();await pause();
  near(run('view.x'),beforeKeyboard.x,'dialog close before keyboard dismissal keeps x');near(run('view.y'),beforeKeyboard.y,'dialog close before keyboard dismissal keeps y');near(run('view.z'),beforeKeyboard.z,'dialog close before keyboard dismissal keeps zoom');e.vv.offsetTop=0;
  await e.resize(1024,800,1024,730);
  near(run('view.x'),beforeKeyboard.x,'keyboard close restores exact x');near(run('view.y'),beforeKeyboard.y,'keyboard close restores exact y');near(run('view.z'),beforeKeyboard.z,'keyboard close preserves exact zoom');
  // Reflow only untouched starter positions; retain user-arranged coordinates.
  w.layoutFixture=run('initial()');const layoutDefaults=JSON.parse(JSON.stringify(w.layoutFixture));
  w.layoutFixture.boards[0].nodes.find(n=>n.id==='tasks').y=305;w.layoutFixture.boards[0].nodes.find(n=>n.id==='resources').y=360;
  run('migrateStarterLayout(window.layoutFixture)');
  assert.equal(w.layoutFixture.boards[0].nodes.find(n=>n.id==='tasks').y,layoutDefaults.boards[0].nodes.find(n=>n.id==='tasks').y);assert.equal(w.layoutFixture.boards[0].nodes.find(n=>n.id==='resources').y,layoutDefaults.boards[0].nodes.find(n=>n.id==='resources').y);
  w.layoutFixture=run('initial()');const arranged=w.layoutFixture.boards[0].nodes.find(n=>n.id==='tasks');arranged.y=490;const repositioned=w.layoutFixture.boards[0].nodes.find(n=>n.id==='resources');repositioned.x=912;repositioned.y=360;
  run('migrateStarterLayout(window.layoutFixture)');assert.equal(arranged.y,490);assert.equal(repositioned.x,912);assert.equal(repositioned.y,360);const once=JSON.stringify(w.layoutFixture);run('migrateStarterLayout(window.layoutFixture)');assert.equal(JSON.stringify(w.layoutFixture),once);
  await e.resize(1280,800,1036,730);assert(!e.inert(q('#sidebar')));assert(!e.inert(q('.main')));assert(!q('#sidebar').classList.contains('open'));
  e.clean();console.log('PASS: phone/tablet/desktop drawer states, focus and inert behavior, touch pan/pinch/drag persistence, resize center/zoom preservation, keyboard open/close stability and safe starter-layout migration.');
})().catch(error=>{console.error(error);process.exitCode=1;});
