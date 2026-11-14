/* Orbit PDF export. Local html2canvas 1.4.1 (MIT) renders Cyrillic as image data. */
(function (global) {
  'use strict';
  const MAX_PIXELS = 12000000, MAX_SIDE = 8192;
  let api, canvas, panel, selectionBox, openButton;
  let rendererPromise = null;
  let active = false, busy = false, area = null, drag = null, boardId = null, generation = 0;
  const pdfIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8m-8 4h6"/></svg>';

  function normalizedRect(a, b) {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
  }
  function screenToWorld(point, view) {
    return { x: (point.x - view.x) / view.z, y: (point.y - view.y) / view.z };
  }
  function worldToScreen(rect, view) {
    return { x: rect.x * view.z + view.x, y: rect.y * view.z + view.y, width: rect.width * view.z, height: rect.height * view.z };
  }
  function intersects(rect, node) {
    return node.x < rect.x + rect.width && node.x + node.width > rect.x && node.y < rect.y + rect.height && node.y + node.height > rect.y;
  }
  function exportScale(rect) {
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width < 1 || rect.height < 1) throw new Error('Оберіть фрагмент дошки.');
    const scale = Math.min(2, MAX_SIDE / rect.width, MAX_SIDE / rect.height, Math.sqrt(MAX_PIXELS / (rect.width * rect.height)));
    if (scale < 0.08) throw new Error('Фрагмент завеликий. Оберіть меншу ділянку дошки.');
    return scale;
  }
  function nodeBounds(node) {
    const el = api.getNodeElement(node.id);
    return { x: node.x, y: node.y, width: el?.offsetWidth || 286, height: el?.offsetHeight || 240 };
  }
  function wholeBoardBounds() {
    const nodes = api.getBoard().nodes;
    if (!nodes.length) return null;
    const boxes = nodes.map(nodeBounds);
    const x = Math.min(...boxes.map(n => n.x)) - 24, y = Math.min(...boxes.map(n => n.y)) - 24;
    return { x, y, width: Math.max(...boxes.map(n => n.x + n.width)) - x + 24, height: Math.max(...boxes.map(n => n.y + n.height)) - y + 24 };
  }
  function notify(message) { api.notify(message); }
  function updateOverlay() {
    if (!active) return;
    if (api.getBoard().id !== boardId) { cancel(true); return; }
    if (!area) { selectionBox.hidden = true; if (!busy) panel.querySelector('.pdf-area-status').textContent = 'Потягніть по дошці, щоб виділити фрагмент'; return; }
    const r = worldToScreen(area, api.getView());
    selectionBox.hidden = false;
    Object.assign(selectionBox.style, { left: r.x + 'px', top: r.y + 'px', width: r.width + 'px', height: r.height + 'px' });
    panel.querySelector('.pdf-area-status').textContent = `${Math.round(area.width)} × ${Math.round(area.height)} · обраний фрагмент`;
    panel.querySelector('#pdf-save-area').disabled = busy || area.width < 8 || area.height < 8;
  }
  function begin() {
    if (busy) return;
    if (!api.getBoard().nodes.length) { notify('Спочатку додайте блоки на дошку.'); return; }
    boardId = api.getBoard().id; active = true; area = null; drag = null;
    panel.hidden = false; selectionBox.hidden = true;
    canvas.classList.add('pdf-selecting'); openButton.classList.add('active'); openButton.setAttribute('aria-pressed', 'true');
    panel.querySelector('.pdf-area-status').textContent = 'Потягніть по дошці, щоб виділити фрагмент';
    panel.querySelector('#pdf-save-area').disabled = true;
    panel.querySelector('#pdf-cancel').focus();
  }
  function cancel(force = false) {
    if (busy && !force) return;
    generation++;
    active = false; area = null; drag = null;
    panel.hidden = true; selectionBox.hidden = true;
    canvas.classList.remove('pdf-selecting'); openButton.classList.remove('active'); openButton.setAttribute('aria-pressed', 'false');
  }
  function point(event) {
    const bounds = canvas.getBoundingClientRect();
    return screenToWorld({ x: Math.max(0, Math.min(canvas.clientWidth, event.clientX - bounds.left)), y: Math.max(0, Math.min(canvas.clientHeight, event.clientY - bounds.top)) }, api.getView());
  }
  function isUI(target) { return !!target.closest('.pdf-panel,.canvas-toolbar,.zoom-controls,.minimap,.canvas-intro,.empty-state,.canvas-hint'); }
  function stopEvent(event) { event.preventDefault(); event.stopImmediatePropagation(); }
  function down(event) {
    if (!active || isUI(event.target)) return;
    stopEvent(event);
    if (busy || drag || event.button > 0) return;
    drag = { pointerId: event.pointerId, start: point(event) };
    area = normalizedRect(drag.start, drag.start);
    canvas.setPointerCapture(event.pointerId); updateOverlay();
  }
  function move(event) {
    if (!active || isUI(event.target)) return;
    if (!drag || drag.pointerId !== event.pointerId) return;
    stopEvent(event); area = normalizedRect(drag.start, point(event)); updateOverlay();
  }
  function up(event) {
    if (!active || !drag || drag.pointerId !== event.pointerId) return;
    stopEvent(event);
    if (event.type === 'pointercancel') area = null;
    else area = normalizedRect(drag.start, point(event));
    drag = null;
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (area && (area.width < 8 || area.height < 8)) { area = null; notify('Потягніть по дошці, щоб виділити ділянку.'); }
    updateOverlay();
  }
  function escape(event) {
    if (!active || busy) return;
    if (event.key === 'Escape') { stopEvent(event); cancel(); openButton.focus(); }
    // While drawing, shortcuts must not open editors or remove board content.
    else if (!event.target.closest('input,textarea,select') && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.stopImmediatePropagation();
    }
  }

  // JPEG image PDF: a single A4 page with the exact selected crop fitted inside its margins.
  function createPDF(jpegBytes, width, height) {
    if (!(jpegBytes instanceof Uint8Array) || !jpegBytes.length || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Не вдалося сформувати PDF.');
    const landscape = width > height, pageW = landscape ? 841.89 : 595.28, pageH = landscape ? 595.28 : 841.89, margin = 24;
    const factor = Math.min((pageW - margin * 2) / width, (pageH - margin * 2) / height);
    const imageW = width * factor, imageH = height * factor, x = (pageW - imageW) / 2, y = (pageH - imageH) / 2;
    const encoder = new TextEncoder(), pieces = [], offsets = [0]; let length = 0;
    const append = value => { const bytes = typeof value === 'string' ? encoder.encode(value) : value; pieces.push(bytes); length += bytes.length; };
    const object = (id, text) => { offsets[id] = length; append(`${id} 0 obj\n${text}\nendobj\n`); };
    append('%PDF-1.4\n% Orbit canvas export\n');
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
    offsets[4] = length;
    append(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.round(width)} /Height ${Math.round(height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
    append(jpegBytes); append('\nendstream\nendobj\n');
    const commands = `q\n${imageW.toFixed(3)} 0 0 ${imageH.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm\n/Im0 Do\nQ\n`;
    object(5, `<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}endstream`);
    const xref = length;
    append('xref\n0 6\n0000000000 65535 f \n');
    for (let id = 1; id <= 5; id++) append(String(offsets[id]).padStart(10, '0') + ' 00000 n \n');
    append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const result = new Uint8Array(length); let offset = 0;
    for (const bytes of pieces) { result.set(bytes, offset); offset += bytes.length; }
    return result;
  }
  function dataURLBytes(dataURL) {
    const raw = global.atob(dataURL.slice(dataURL.indexOf(',') + 1));
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  }
  function makeStage(rect) {
    const stage = document.createElement('div');
    stage.className = 'orbit-pdf-stage'; stage.setAttribute('aria-hidden', 'true');
    Object.assign(stage.style, { width: rect.width + 'px', height: rect.height + 'px' });
    const original = document.getElementById('world'), copy = original.cloneNode(true);
    copy.removeAttribute('id'); copy.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    copy.querySelectorAll('.node-actions,.node-connector,.file-download').forEach(el => el.remove());
    copy.querySelectorAll('.selected,.connection-source').forEach(el => el.classList.remove('selected', 'connection-source'));
    const svg = copy.querySelector('.edges');
    if (svg) {
      svg.remove(); svg.setAttribute('viewBox', `${rect.x} ${rect.y} ${rect.width} ${rect.height}`);
      svg.setAttribute('width', String(rect.width)); svg.setAttribute('height', String(rect.height));
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svg.classList.add('pdf-edges');
      // SVG is serialized into an image by html2canvas, so its strokes cannot rely on page CSS.
      svg.querySelectorAll('path').forEach(path => { path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#819776'); path.setAttribute('stroke-width', '1.3'); path.setAttribute('opacity', '1'); });
      svg.querySelectorAll('circle').forEach(circle => circle.setAttribute('fill', '#819776'));
      stage.append(svg);
    }
    Object.assign(copy.style, { left: -rect.x + 'px', top: -rect.y + 'px', transform: 'none', transition: 'none', width: '0px', height: '0px' });
    // Checkbox appearance must be copied explicitly; cloneNode does not reliably serialize checked state.
    copy.querySelectorAll('input[type="checkbox"]').forEach(input => {
      const mark = document.createElement('span'); mark.className = 'pdf-checkbox'; mark.textContent = input.checked ? '✓' : '□'; input.replaceWith(mark);
    });
    stage.append(copy); document.body.append(stage); return stage;
  }
  function loadRenderer() {
    if (typeof global.html2canvas === 'function') return Promise.resolve(global.html2canvas);
    if (rendererPromise) return rendererPromise;
    rendererPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.async = true;
      script.dataset.orbitPdfRenderer = 'true';
      script.src = new URL('vendor/html2canvas-1.4.1.min.js', document.baseURI).href;
      let timer;
      const cleanup = () => { global.clearTimeout(timer); script.onload = null; script.onerror = null; };
      const fail = () => {
        cleanup(); script.remove(); rendererPromise = null;
        reject(new Error('Не вдалося завантажити модуль PDF. Перевірте з’єднання та спробуйте ще раз.'));
      };
      script.onload = () => {
        if (typeof global.html2canvas !== 'function') { fail(); return; }
        cleanup(); resolve(global.html2canvas);
      };
      script.onerror = fail;
      timer = global.setTimeout(fail, 15000);
      try { document.head.append(script); } catch { fail(); }
    });
    const attempt = rendererPromise;
    attempt.catch(() => { if (rendererPromise === attempt) rendererPromise = null; });
    return attempt;
  }
  async function saveArea(rect) {
    if (busy || !rect) return;
    let stage;
    const board = api.getBoard(), title = board.name, exportGeneration = generation;
    try {
      const scale = exportScale(rect);
      if (!board.nodes.some(node => intersects(rect, nodeBounds(node)))) { notify('У фрагменті немає блоків. Оберіть ділянку з вмістом.'); return; }
      busy = true;
      panel.querySelectorAll('button').forEach(button => button.disabled = true);
      panel.querySelector('.pdf-area-status').textContent = typeof global.html2canvas === 'function' ? 'Створюємо PDF…' : 'Завантажуємо модуль PDF…';
      const renderer = await loadRenderer();
      if (generation !== exportGeneration) return;
      panel.querySelector('.pdf-area-status').textContent = 'Створюємо PDF…';
      stage = makeStage(rect);
      await Promise.race([document.fonts?.ready || Promise.resolve(), new Promise(resolve => setTimeout(resolve, 1200))]);
      const image = await renderer(stage, { backgroundColor: '#ffffff', scale, logging: false, useCORS: false, allowTaint: false, imageTimeout: 5000, scrollX: 0, scrollY: 0, width: rect.width, height: rect.height, onclone: doc => { doc.body.dataset.theme = 'light'; } });
      if (generation !== exportGeneration) return;
      const bytes = createPDF(dataURLBytes(image.toDataURL('image/jpeg', 0.94)), image.width, image.height);
      const name = (title || 'Дошка').replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0, 80);
      api.download(new Blob([bytes], { type: 'application/pdf' }), `${name}_фрагмент.pdf`);
      notify('Фрагмент збережено у PDF.');
    } catch (error) { notify(error.message || 'Не вдалося створити PDF. Спробуйте менший фрагмент.'); }
    finally {
      stage?.remove(); busy = false;
      panel.querySelectorAll('button').forEach(button => button.disabled = false);
      updateOverlay();
    }
  }
  function init(hooks) {
    if (api) return;
    api = hooks || global.OrbitCanvas; canvas = document.getElementById('canvas');
    if (!api || !canvas) throw new Error('PDF export needs OrbitCanvas hooks.');
    openButton = document.createElement('button'); openButton.type = 'button'; openButton.id = 'pdf-export-open'; openButton.className = 'btn ghost';
    openButton.title = 'Виділити фрагмент і зберегти PDF'; openButton.setAttribute('aria-label', openButton.title); openButton.setAttribute('aria-pressed', 'false');
    openButton.innerHTML = pdfIcon + '<span class="pdf-button-label">PDF</span>';
    document.querySelector('.top-actions').insertBefore(openButton, document.getElementById('add-block'));
    openButton.addEventListener('click', () => active ? cancel() : begin());
    selectionBox = document.createElement('div'); selectionBox.className = 'pdf-selection'; selectionBox.hidden = true; selectionBox.setAttribute('aria-hidden', 'true'); canvas.append(selectionBox);
    panel = document.createElement('section'); panel.className = 'pdf-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'Експорт фрагмента у PDF');
    panel.innerHTML = '<div class="pdf-panel-title">' + pdfIcon + '<strong>Фрагмент дошки → PDF</strong></div><p class="pdf-area-status" role="status" aria-live="polite"></p><p class="pdf-panel-hint">Виділіть прямокутну ділянку мишею або пальцем. До PDF потрапить лише її вміст.</p><div class="pdf-panel-actions"><button class="btn primary" id="pdf-save-area" type="button" disabled>Зберегти PDF</button><button class="btn ghost" id="pdf-save-whole" type="button">Уся дошка</button><button class="btn ghost" id="pdf-cancel" type="button">Скасувати</button></div>';
    canvas.append(panel);
    panel.querySelector('#pdf-save-area').addEventListener('click', () => saveArea(area && { ...area }));
    panel.querySelector('#pdf-save-whole').addEventListener('click', () => saveArea(wholeBoardBounds()));
    panel.querySelector('#pdf-cancel').addEventListener('click', cancel);
    canvas.addEventListener('pointerdown', down, true); canvas.addEventListener('pointermove', move, true);
    canvas.addEventListener('pointerup', up, true); canvas.addEventListener('pointercancel', up, true);
    canvas.addEventListener('click', event => { if (active && !isUI(event.target)) stopEvent(event); }, true);
    canvas.addEventListener('dblclick', event => { if (active && !isUI(event.target)) stopEvent(event); }, true);
    global.addEventListener('keydown', escape, true);
    document.addEventListener('orbit:view', updateOverlay); document.addEventListener('orbit:render', updateOverlay);
    document.addEventListener('orbit:profile', () => cancel(true));
  }
  global.OrbitPDF = { init, begin, cancel, saveArea, utils: { normalizedRect, screenToWorld, worldToScreen, intersects, exportScale, createPDF } };
  if (global.OrbitCanvas && document.getElementById('canvas')) init();
})(typeof window !== 'undefined' ? window : globalThis);
