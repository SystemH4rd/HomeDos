const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const zip=require('../docs/vendor/fflate-0.8.2.js'),enc=s=>new TextEncoder().encode(s),base=process.env.ORBIT_TEST_URL||'http://127.0.0.1:8765';
const archive=files=>Array.from(zip.zipSync(Object.fromEntries(Object.entries(files).map(([p,s])=>[p,enc(s)]))));
function pdfFixture(){let pdf='%PDF-1.4\n',offsets=[0];const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length 48 >>\nstream\nBT /F1 20 Tf 40 440 Td (Orbit PDF preview) Tj ET\nendstream'];objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+obj+'\nendobj\n';});const xref=pdf.length;pdf+='xref\n0 6\n0000000000 65535 f \n';offsets.slice(1).forEach(o=>pdf+=String(o).padStart(10,'0')+' 00000 n \n');pdf+='trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';return Array.from(enc(pdf));}
const fixtures=[
 {name:'Фото.svg',mime:'image/svg+xml',bytes:Array.from(enc('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#568b65"/><circle cx="490" cy="90" r="45" fill="#f5d990"/><path d="M0 360L180 110L340 360M220 360L430 160L640 360" fill="#c5dfbc"/></svg>'))},
 {name:'План.docx',bytes:archive({'word/document.xml':'<w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>План подорожі</w:t></w:r></w:p><w:p><w:r><w:t>Зібрати документи та квитки.</w:t></w:r></w:p></w:body></w:document>'})},
 {name:'Бюджет.xlsx',bytes:archive({'xl/workbook.xml':'<workbook xmlns:r="urn:rel"><sheets><sheet name="Бюджет" r:id="r1"/><sheet name="Плани" r:id="r2"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="worksheets/sheet2.xml"/></Relationships>','xl/sharedStrings.xml':'<sst><si><t>Витрати</t></si></sst>','xl/worksheets/sheet1.xml':'<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1"><v>1200</v></c></row></sheetData></worksheet>','xl/worksheets/sheet2.xml':'<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>Наступний місяць</t></is></c></row></sheetData></worksheet>'})},
 {name:'Нотатки.html',bytes:Array.from(enc('<script>window.unsafeExecuted=true</script><h1>Безпечний текст</h1>'))},
 {name:'Дані.csv',bytes:Array.from(enc('Назва;Опис\n"Перший";"Рядок; з крапкою"\nДругий;"Два\nрядки"'))},
 {name:'Пошкоджений.docx',bytes:[0,1,2,3]},
 {name:'Старий.doc',bytes:[0,1,2]},
 {name:'Інструкція.pdf',mime:'application/pdf',bytes:pdfFixture()},
 {name:'Музика.mp3',mime:'audio/mpeg',bytes:[0,1]},
 {name:'Відео.mp4',mime:'video/mp4',bytes:[0,1]},
 {name:'Документ.odt',bytes:archive({'content.xml':'<office:document xmlns:office="urn:office" xmlns:text="urn:text"><text:p>Текст OpenDocument</text:p></office:document>'})},
 {name:'Презентація.pptx',bytes:archive({'ppt/slides/slide1.xml':'<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:p><a:r><a:t>Перший слайд</a:t></a:r></a:p></p:sld>'})},
 {name:'Великий.docx',bytes:archive({'word/document.xml':'x'.repeat(9*1024*1024)})}

];
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/auth-config.js*',route=>route.fulfill({contentType:'text/javascript',body:"window.ORBIT_AUTH_CONFIG={url:'',publishableKey:''};"}));
 await page.goto(base);await page.waitForFunction(()=>window.OrbitFiles);
 await page.evaluate(async fixtures=>{const nodes=[];for(const [i,f]of fixtures.entries()){const id='fixture-'+i;await OrbitCanvas.putFile(id,new Blob([new Uint8Array(f.bytes)],{type:f.mime||'application/octet-stream'}));nodes.push({id:'node-'+i,type:'file',title:f.name,fileName:f.name,fileId:id,fileSize:f.bytes.length,mime:f.mime||'',x:(i%3)*330,y:Math.floor(i/3)*430});}OrbitCanvas.replaceWorkspace({version:1,active:'files',boards:[{id:'files',name:'Матеріали проєкту',nodes,edges:[]}]});},fixtures);
 await page.waitForFunction(()=>document.querySelector('[data-id="node-0"] .attachment-card img')?.naturalWidth===640);
 await page.locator('[data-id="node-1"] .attachment-card').waitFor();await page.waitForFunction(()=>document.querySelector('[data-id="node-1"] .attachment-card').textContent.includes('План подорожі'));
 await page.screenshot({path:'/tmp/orbit-files-board.png'});
 const open=async index=>{await page.evaluate(i=>OrbitFiles.open(OrbitCanvas.getBoard().nodes[i]),index);await page.locator('#attachment-viewer').waitFor({state:'visible'});};
 await open(0);await page.waitForFunction(()=>document.querySelector('.attachment-image')?.naturalWidth===640);await page.locator('#attachment-plus').click();assert.equal(await page.locator('#attachment-fit').innerText(),'130%');await page.locator('#attachment-fit').click();assert.equal(await page.locator('#attachment-fit').innerText(),'Умістити');
 await page.locator('#attachment-next').click();await page.locator('.attachment-document').waitFor();assert.match(await page.locator('.attachment-document').innerText(),/План подорожі/);await page.screenshot({path:'/tmp/orbit-files-document.png'});
 await open(2);await page.locator('.attachment-sheet').waitFor();assert.match(await page.locator('.attachment-grid').innerText(),/1200/);await page.locator('.attachment-sheet').selectOption('1');assert.match(await page.locator('.attachment-grid').innerText(),/Наступний місяць/);
 await open(3);await page.locator('.attachment-document').waitFor();assert.match(await page.locator('.attachment-document').innerText(),/<script>/);assert.equal(await page.evaluate(()=>window.unsafeExecuted),undefined);
 await open(4);await page.locator('.attachment-table').last().waitFor();assert.match(await page.locator('.attachment-grid').innerText(),/Рядок; з крапкою/);
 await open(5);await page.waitForFunction(()=>document.querySelector('#attachment-content').textContent!=='Завантаження…');const download=page.waitForEvent('download');await page.locator('#attachment-download').click();assert.equal((await download).suggestedFilename(),'Пошкоджений.docx');
 await open(6);await page.locator('.attachment-unsupported').waitFor();assert.match(await page.locator('.attachment-unsupported').innerText(),/DOCX/);
 await open(7);await page.locator('.attachment-pdf').waitFor();await page.waitForFunction(()=>document.querySelector('.attachment-pdf canvas')?.width>0);await page.waitForFunction(()=>document.querySelector('.pdf-page-text').textContent.includes('Orbit PDF preview'));await page.screenshot({path:'/tmp/orbit-files-pdf.png'});
 await open(8);await page.locator('audio[controls]').waitFor();await open(9);await page.locator('video[controls]').waitFor();
 await open(10);await page.locator('.attachment-document').waitFor();assert.match(await page.locator('.attachment-document').innerText(),/Текст OpenDocument/);
 await open(11);await page.locator('.attachment-document').waitFor();assert.match(await page.locator('.attachment-document').innerText(),/Перший слайд/);
 await open(12);await page.waitForFunction(()=>document.querySelector('#attachment-content').textContent.includes('завеликий'));
 await page.locator('#attachment-close').click();await page.evaluate(()=>OrbitCanvas.activateUser('other-profile'));assert.equal(await page.locator('#attachment-viewer').isVisible(),false);
 await page.evaluate(()=>OrbitCanvas.activateUser(null));await page.setViewportSize({width:375,height:812});await open(1);await page.locator('.attachment-document').waitFor();assert(await page.evaluate(()=>document.querySelector('#attachment-viewer').getBoundingClientRect().width<=innerWidth));await page.screenshot({path:'/tmp/orbit-files-mobile.png'});
 await page.locator('#attachment-close').click();await page.evaluate(()=>document.dispatchEvent(new CustomEvent('orbit:profile')));assert.equal(await page.locator('[data-id="node-1"] > .node-body > .file-open.btn').count(),1);
 // The same viewer also reads a private-cloud blob and ignores a late response after logout.
 await page.evaluate(async()=>{window.previousSync=OrbitSync;window.cloudReads=0;window.OrbitSync={downloadFile:async()=>{window.cloudReads++;return new Blob(['Текст із приватної хмари']);}};await OrbitFiles.open({id:'cloud-node',fileId:'cloud-only',fileName:'Cloud.txt',type:'file'});});await page.locator('.attachment-document').waitFor();assert.match(await page.locator('.attachment-document').innerText(),/приватної хмари/);assert.equal(await page.evaluate(()=>window.cloudReads),1);
 await page.evaluate(()=>{window.OrbitSync={downloadFile:()=>new Promise(resolve=>window.resolveCloud=resolve)};window.latePreview=OrbitFiles.open({id:'late-node',fileId:'late-cloud',fileName:'Late.txt',type:'file'});});await page.waitForFunction(()=>window.resolveCloud);
 await page.evaluate(async()=>{OrbitCanvas.activateUser('race-profile');window.resolveCloud(new Blob(['Private old profile']));await window.latePreview;window.OrbitSync=window.previousSync;});assert.equal(await page.locator('#attachment-viewer').isVisible(),false);
 assert.deepEqual(errors,[]);console.log('PASS: real Chromium image previews/zoom, DOCX text, XLSX sheets, inert HTML, quoted CSV, corrupt-file download, legacy fallback, PDF rendering/text, ODT/PPTX, archive limits, media, private cloud loading, logout races, mobile layout and duplicate-action prevention.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
