// Sekcja 11 – grafika AI (docs/sections/11-grafika-ai.md).
// Osobny plik, żeby nie mieszać z resztą bryty.html. Haki w bryty.html:
//   <div id="aiBox" class="step"></div> (pod krokiem 1) i <script src="ai.js"></script> na końcu strony.
// Przebieg z transkryptu (L56–64, L292–298, L390–393): opis lub zdjęcie-inspiracja -> kilka propozycji ->
// wybór -> ewentualna poprawka -> powiększenie do wymiaru druku -> dalej zwykły podział na bryty.
// Tryb wybiera się sam: strona otwarta przez start-fototapety.bat i klucz OpenAI na serwerze (ai-serwer.js)
// -> prawdziwe AI; w każdym innym przypadku TRYB DEMO (obrazki rysuje przeglądarka, nic nie idzie do internetu).
// Jedyne miejsce wywołania AI to callApi() niżej. Klucz jest tylko na serwerze, nigdy w tej stronie.
'use strict';
window.GrafikaAI = (() => {
  const CONFIG = {
    mode: 'demo',          // 'demo' = bez AI, bez sieci; 'serwer' = POST na endpoint (ustawia detect())
    endpoint: '/api/ai',   // lokalny serwer dopisuje klucz i wysyła zapytanie do OpenAI
    upscale: false,        // powiększanie do druku (Topaz) – włącza detect(), gdy serwer ma klucz Topaz
    previewLong: 1024,     // dłuższy bok podglądu propozycji [px]
  };
  // Style to tylko podpowiedź dopisywana do opisu. Lista robocza – DO WALIDACJI z Rafałem / graficzką.
  const STYLES = [
    ['ref', 'Jak na zdjęciu-inspiracji'],
    ['foto', 'Fotografia (realistycznie)'],
    ['akwarela', 'Akwarela / malarstwo'],
    ['ilustracja', 'Ilustracja / szkic'],
    ['botanika', 'Botanika / liście'],
    ['geometria', 'Wzór geometryczny'],
    ['vintage', 'Vintage / retro'],
  ];
  const STYLE_PROMPT = {
    ref: null,   // styl bierze się z wgranej inspiracji
    foto: 'photorealistic photograph, natural light, high detail',
    akwarela: 'watercolor painting, soft brush strokes',
    ilustracja: 'clean line illustration, crisp consistent lines',
    botanika: 'botanical illustration, leaves and plants',
    geometria: 'seamless geometric pattern, flat colors',
    vintage: 'vintage retro style, muted palette',
  };

  const $ = id => document.getElementById(id);
  const num = id => { const el = $(id); const v = el ? parseFloat(String(el.value).replace(',', '.')) : NaN; return Number.isFinite(v) ? v : 0; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = x => Math.round(x).toLocaleString('pl-PL');
  let reference = null;      // { dataUrl, name } – zdjęcie-inspiracja
  let results = [];          // [{ blob, url, width, height, prompt }]
  let chosen = -1;
  let busy = false;

  // Wymiar całości do druku (ściana + naddatki) i liczba pikseli przy wybranym DPI – to samo, co liczy podział.
  function target() {
    const w = num('wallW') + num('mL') + num('mR'), h = num('wallH') + num('mT') + num('mB');
    const dpi = num('dpi') || 150;
    const px = cm => cm / 2.54 * dpi;
    return { wCm: w, hCm: h, dpi, wPx: Math.round(px(w)), hPx: Math.round(px(h)), aspect: h > 0 ? w / h : 1 };
  }

  // ===== JEDYNE MIEJSCE WYWOŁANIA AI =====
  // kind: 'generate' | 'edit' | 'upscale'
  // payload: { prompt, style, count, aspect, widthCm, heightCm, targetPx: {w, h}, reference (dataURL | null), source (dataURL | null) }
  // zwraca: { images: [{ blob, width, height }], demo: true|false }
  async function callApi(kind, payload) {
    if (CONFIG.mode === 'serwer' || (kind === 'upscale' && CONFIG.upscale)) {   // serwer może mieć samo powiększanie (bez klucza OpenAI)
      const r = await fetch(CONFIG.endpoint + '/' + kind, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.text()) || 'Serwer AI zwrócił błąd ' + r.status);
      // Powiększenie wraca jako plik JPG (setki MP) – wymiar z nagłówków, bez dekodowania w przeglądarce.
      if ((r.headers.get('Content-Type') || '').startsWith('image/'))
        return { images: [{ blob: await r.blob(), width: +r.headers.get('X-Width'), height: +r.headers.get('X-Height') }], demo: false };
      const j = await r.json();   // oczekiwany format: { images: [{ dataUrl, width, height }] }
      const images = await Promise.all(j.images.map(async x => {
        const blob = await (await fetch(x.dataUrl)).blob();
        const bm = await createImageBitmap(blob);   // prawdziwy wymiar obrazu, nie zamówiony
        const im = { blob, width: bm.width, height: bm.height }; bm.close(); return im;
      }));
      return { images, demo: false };
    }
    return demoApi(kind, payload);
  }

  // ----- Tryb demo: obrazki zastępcze rysowane lokalnie, wyraźnie podpisane „DEMO” -----
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const toBlob = cv => new Promise(res => cv.toBlob(res, 'image/png'));

  async function demoApi(kind, p) {
    await new Promise(r => setTimeout(r, 300));   // udaje czas odpowiedzi
    const long = CONFIG.previewLong;
    const w = p.aspect >= 1 ? long : Math.round(long * p.aspect), h = p.aspect >= 1 ? Math.round(long / p.aspect) : long;
    const n = kind === 'generate' ? p.count : 1;
    const images = [];
    for (let i = 0; i < n; i++) {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      const r = rng(hash(p.prompt + '|' + p.style + '|' + i + '|' + kind));
      const hue = Math.floor(r() * 360);
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, `hsl(${hue},45%,82%)`); g.addColorStop(1, `hsl(${(hue + 60) % 360},40%,55%)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (let k = 0; k < 40; k++) {
        ctx.fillStyle = `hsla(${(hue + r() * 120) % 360},50%,${30 + r() * 50}%,${0.15 + r() * 0.35})`;
        ctx.beginPath();
        if (p.style === 'geometria') { const s = 20 + r() * 160; ctx.rect(r() * w, r() * h, s, s); }
        else ctx.ellipse(r() * w, r() * h, 20 + r() * 220, 10 + r() * 120, r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p.source) {   // poprawka: pokaż, że bazuje na wybranej propozycji
        const im = await loadImg(p.source);
        ctx.globalAlpha = 0.6; ctx.drawImage(im, 0, 0, w, h); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(0, h - 64, w, 64);
      ctx.fillStyle = '#222a35'; ctx.font = '600 22px Urbanist, Arial, sans-serif';
      ctx.fillText(`PODGLĄD PRZYKŁADOWY · ${kind === 'edit' ? 'poprawka' : 'propozycja ' + (i + 1)}`, 16, h - 36);
      ctx.font = '15px Urbanist, Arial, sans-serif';
      ctx.fillText(p.prompt.slice(0, 110), 16, h - 14);
      images.push({ blob: await toBlob(cv), width: w, height: h });
    }
    return { images, demo: true };
  }

  const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  const blobToDataUrl = b => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });

  function css() {
    if ($('aiCss')) return;
    const s = document.createElement('style'); s.id = 'aiCss';
    s.textContent = `
      #aiBox { border-top: 3px solid var(--v-green); }
      #aiBox > summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 17px; }
      #aiBox > summary::-webkit-details-marker { display: none; }
      #aiBox > summary::before { content: "AI"; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: var(--v-green); color: var(--v-ink); font-size: 11px; font-weight: 700; }
      #aiBox > summary .ai-opt { margin-left: auto; font-size: 12px; font-weight: 500; color: var(--muted); }
      #aiBox textarea { width: 100%; min-height: 76px; padding: 10px 12px; border: 1px solid var(--line); background: var(--field); color: var(--text); font: 14px/1.4 var(--font); resize: vertical; }
      #aiBox textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--focus); }
      #aiBox .ai-row { display: grid; grid-template-columns: 1fr 110px; gap: 10px; }
      #aiBox .ai-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
      #aiBox .ai-grid button.ai-thumb { height: auto; padding: 0; background: var(--disabled); border: 2px solid transparent; }
      #aiBox .ai-grid button.ai-thumb img { display: block; width: 100%; height: auto; }
      #aiBox .ai-grid button.ai-thumb.on { border-color: var(--v-green); }
      #aiBox .ai-cell { position: relative; }
      #aiBox .ai-cell button.ai-zoom { position: absolute; top: 6px; right: 6px; width: auto; display: inline-block; height: auto; min-height: 0; padding: 4px 8px; font-size: 11px; letter-spacing: .5px;
        background: rgba(255,255,255,.92); color: #222; border: 1px solid rgba(0,0,0,.15); }
      #aiView { position: fixed; inset: 0; z-index: 1000; background: #14181e; display: flex; flex-direction: column; color: #fff; }
      #aiView[hidden] { display: none; }
      #aiView .av-bar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; flex-wrap: wrap; }
      #aiView .av-bar .av-title { font-size: 14px; margin-right: auto; }
      #aiView .av-bar button { width: auto; flex: none; display: inline-block; margin: 0; height: auto; min-height: 0; padding: 8px 14px; font-size: 13px; background: rgba(255,255,255,.12); color: #fff; border: 1px solid rgba(255,255,255,.3); }
      #aiView .av-bar button.av-pick { background: var(--v-green, #25c09e); color: #222; border-color: transparent; font-weight: 700; }
      #aiView .av-stage { position: relative; flex: 1; overflow: hidden; cursor: grab; touch-action: none; }
      #aiView .av-stage.drag { cursor: grabbing; }
      #aiView .av-stage img { position: absolute; left: 0; top: 0; transform-origin: 0 0; max-width: none; user-select: none; -webkit-user-drag: none; }
      #aiView .av-hint { padding: 6px 14px 12px; font-size: 12px; color: rgba(255,255,255,.7); }
      #aiBox .ai-ref { display: flex; align-items: center; gap: 10px; margin-top: 6px; font-size: 13px; }
      #aiBox .ai-ref img { width: 64px; height: 44px; object-fit: cover; border: 1px solid var(--line); }
      #aiBox .ai-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
      #aiBox .ai-msg { margin-top: 8px; font-size: 13px; }
      #aiBox .ai-msg.err { color: var(--err); }
      #aiBox .ai-demo { margin-top: 8px; padding: 8px 10px; background: var(--warn-bg); color: var(--warn); font-size: 12.5px; }
      #aiBox .ai-check { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; margin-top: 8px; }
      #aiBox .ai-check input { margin-top: 3px; }
      #aiQuality .ai-msg { margin-top: 6px; font-size: 13px; } #aiQuality .ai-msg.err { color: var(--err); } #aiQuality[hidden] { display: none; }
      #aiQuality { margin: 8px 0 4px; } #aiQuality .hint { margin-top: 4px; } #aiQuality:not([hidden]) + .jq-scale { margin-top: 12px; }`;
    document.head.appendChild(s);
  }

  function build() {
    const box = $('aiBox'); if (!box) return;
    const t = target();
    box.innerHTML = `<details id="aiDetails"><summary>Grafika AI<span class="ai-opt">opcjonalnie</span></summary>
      <div class="hint">Nie masz zdjęcia? Opisz tapetę albo wgraj zdjęcie, które Ci się podoba (np. znalezione w internecie). AI stworzy nowe, własne zdjęcie w podobnym klimacie. Wybierz jedną z propozycji i przekaż ją do podziału na bryty.</div>
      <div class="ai-demo" id="aiMode" role="status" aria-live="polite">Sprawdzam połączenie z AI…</div>
      <label for="aiPrompt">Opis tapety</label>
      <textarea id="aiPrompt" placeholder="np. las sosnowy we mgle o świcie, spokojne zielenie, bez ludzi"></textarea>
      <div class="ai-row">
        <div><label for="aiStyle">Styl</label><select id="aiStyle">${STYLES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
        <div><label for="aiCount">Propozycje</label><select id="aiCount"><option>1</option><option>2</option><option>3</option><option selected>4</option></select></div>
      </div>
      <label for="aiRef">Zdjęcie-inspiracja, np. z internetu (opcjonalnie)</label>
      <input id="aiRef" type="file" accept="image/jpeg,image/png">
      <div id="aiRefInfo"></div>
      <div class="ai-check" id="aiRefRights" hidden><input type="checkbox" id="aiRefOk"><label for="aiRefOk" style="margin:0">Rozumiem, że AI stworzy nowe zdjęcie w podobnym temacie, kolorach i nastroju, a nie kopię ani przeróbkę wgranego zdjęcia (prawa autorskie).</label></div>
      <div class="hint" id="aiTarget">Do druku potrzeba: <b>${fmt(t.wPx)} × ${fmt(t.hPx)} px</b> (${t.wCm} × ${t.hCm} cm z naddatkami, ${t.dpi} DPI).</div>
      <div class="ai-actions"><button type="button" id="aiGen">Wygeneruj propozycje</button></div>
      <div id="aiMsg" class="ai-msg" role="status" aria-live="polite"></div>
      <div id="aiGrid" class="ai-grid"></div>
      <div id="aiAfter" hidden>
        <label for="aiFix">Poprawka wybranej propozycji (opcjonalnie)</label>
        <textarea id="aiFix" placeholder="np. jaśniejsze tło, drzwi w odcieniu różu"></textarea>
        <div class="ai-actions">
          <button type="button" class="small" id="aiFixBtn">Popraw wybraną</button>
          <button type="button" id="aiUse">Użyj wybranej do podziału</button>
        </div>
      </div>
    </details>`;
  }

  function msg(text, err) { const m = $('aiMsg'); if (m) { m.textContent = text; m.className = 'ai-msg' + (err ? ' err' : ''); } }
  function setBusy(b) { busy = b; ['aiGen', 'aiFixBtn', 'aiUse'].forEach(id => { const el = $(id); if (el) el.disabled = b; }); }

  function showResults() {
    const cells = $('aiGrid').querySelectorAll('.ai-thumb');
    if (cells.length === results.length) {   // tylko zmiana wyboru – bez przerysowania (inaczej dwuklik nie działa)
      cells.forEach((c, i) => c.classList.toggle('on', i === chosen));
      $('aiAfter').hidden = chosen < 0;
      return;
    }
    $('aiGrid').innerHTML = results.map((r, i) => `<div class="ai-cell"><button type="button" class="ai-thumb${i === chosen ? ' on' : ''}" data-i="${i}" aria-label="Propozycja ${i + 1}" title="Kliknij, aby wybrać. Dwuklik – powiększ."><img src="${r.url}" alt="Propozycja ${i + 1}"></button>` +
      `<button type="button" class="ai-zoom" data-z="${i}" title="Powiększ na cały ekran">Powiększ</button></div>`).join('');
    $('aiAfter').hidden = chosen < 0;
  }
  function setResults(images, prompt) {
    results.forEach(r => URL.revokeObjectURL(r.url));
    results = images.map(x => ({ ...x, url: URL.createObjectURL(x.blob), prompt }));
    chosen = results.length === 1 ? 0 : -1;
    $('aiGrid').innerHTML = '';   // nowe obrazy – pełne przerysowanie
    showResults();
  }

  function addResults(images, prompt) {
    results.push(...images.map(x => ({ ...x, url: URL.createObjectURL(x.blob), prompt })));
    showResults();
  }

  // Podgląd propozycji na cały ekran: kółko myszy / przyciski = przybliżenie, przeciąganie = przesuwanie,
  // strzałki = następna/poprzednia, Esc = zamknij. „Wybierz tę propozycję” zaznacza ją i zamyka podgląd.
  const view = { i: 0, k: 1, x: 0, y: 0, fit: 1 };
  function viewer() {
    let v = $('aiView'); if (v) return v;
    v = document.createElement('div'); v.id = 'aiView'; v.hidden = true;
    v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true'); v.setAttribute('aria-label', 'Podgląd propozycji AI');
    v.innerHTML = '<div class="av-bar"><span class="av-title" id="avTitle"></span>' +
      '<button type="button" data-a="prev" title="Poprzednia (←)" aria-label="Poprzednia propozycja">‹</button><button type="button" data-a="next" title="Następna (→)" aria-label="Następna propozycja">›</button>' +
      '<button type="button" data-a="out" title="Oddal" aria-label="Oddal">−</button><button type="button" data-a="fit">Cały obraz</button><button type="button" data-a="in" title="Przybliż" aria-label="Przybliż">+</button>' +
      '<button type="button" class="av-pick" data-a="pick">Wybierz tę propozycję</button><button type="button" data-a="close" title="Zamknij (Esc)" aria-label="Zamknij podgląd">✕</button></div>' +
      '<div class="av-stage" id="avStage"><img id="avImg" alt=""></div>' +
      '<div class="av-hint">Kółko myszy przybliża, przeciągnij, aby przesunąć. Strzałki ← → zmieniają propozycję, Esc zamyka.</div>';
    document.body.appendChild(v);
    const st = $('avStage'), im = $('avImg');
    const apply = () => { im.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`; };
    const zoomAt = (f, cx, cy) => {
      const k = Math.min(view.fit * 8, Math.max(view.fit, view.k * f));
      view.x = cx - (cx - view.x) * k / view.k; view.y = cy - (cy - view.y) * k / view.k; view.k = k; apply();
    };
    const fit = () => {
      const r = results[view.i]; if (!r) return;
      const W = st.clientWidth, H = st.clientHeight;
      view.fit = view.k = Math.min(W / r.width, H / r.height);
      view.x = (W - r.width * view.k) / 2; view.y = (H - r.height * view.k) / 2; apply();
    };
    v.show = i => {
      view.i = (i + results.length) % results.length;
      const r = results[view.i];
      im.src = r.url; im.width = r.width; im.height = r.height;
      $('avTitle').textContent = `Propozycja ${view.i + 1} z ${results.length}` + (view.i === chosen ? ' – wybrana' : '');
      if (v.hidden) { back = document.activeElement; v.hidden = false; v.querySelector('[data-a=close]').focus(); }
      fit();
    };
    let back = null;   // fokus wraca tam, skąd otwarto podgląd
    const close = () => { v.hidden = true; if (back && back.isConnected) back.focus(); back = null; };
    v.addEventListener('click', e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      const c = () => [st.clientWidth / 2, st.clientHeight / 2];
      ({ prev: () => v.show(view.i - 1), next: () => v.show(view.i + 1), fit, close,
        in: () => zoomAt(1.5, ...c()), out: () => zoomAt(1 / 1.5, ...c()),
        pick: () => { chosen = view.i; showResults(); msg('Wybrano propozycję ' + (chosen + 1) + '. Możesz ją poprawić albo użyć do podziału.'); close(); } })[a.dataset.a]();
    });
    st.addEventListener('wheel', e => { e.preventDefault(); const b = st.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - b.left, e.clientY - b.top); }, { passive: false });
    let from = null;
    st.addEventListener('pointerdown', e => { from = { x: e.clientX - view.x, y: e.clientY - view.y }; st.setPointerCapture(e.pointerId); st.classList.add('drag'); });
    st.addEventListener('pointermove', e => { if (!from) return; view.x = e.clientX - from.x; view.y = e.clientY - from.y; apply(); });
    ['pointerup', 'pointercancel'].forEach(ev => st.addEventListener(ev, () => { from = null; st.classList.remove('drag'); }));
    st.addEventListener('dblclick', e => { const b = st.getBoundingClientRect(); view.k > view.fit * 1.01 ? fit() : zoomAt(3, e.clientX - b.left, e.clientY - b.top); });
    document.addEventListener('keydown', e => {
      if (v.hidden) return;
      if (e.key === 'Tab') {   // Tab krąży po przyciskach podglądu, nie ucieka pod spód
        const b = [...v.querySelectorAll('button')], i = b.indexOf(document.activeElement);
        b[(i + (e.shiftKey ? -1 : 1) + b.length) % b.length].focus();
      } else if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') v.show(view.i - 1); else if (e.key === 'ArrowRight') v.show(view.i + 1); else return;
      e.preventDefault();
    });
    window.addEventListener('resize', () => { if (!v.hidden) fit(); });
    return v;
  }

  function payload(extra) {
    const t = target();
    const prompt = $('aiPrompt').value.trim();
    const style = $('aiStyle').value;
    return { prompt, style, stylePrompt: STYLE_PROMPT[style], count: +$('aiCount').value, aspect: t.aspect,
      widthCm: t.wCm, heightCm: t.hCm, targetPx: { w: t.wPx, h: t.hPx }, reference: reference ? reference.dataUrl : null, source: null, ...extra };
  }

  async function generate() {
    const p = payload();
    if (!p.prompt && !p.reference) return msg('Wpisz opis tapety albo wgraj zdjęcie-inspirację.', true);
    if (p.reference && !$('aiRefOk').checked) return msg('Zaznacz, że inspiracja służy tylko jako kierunek (prawa autorskie).', true);
    setBusy(true); msg('Tworzę propozycje…');
    try {
      if (CONFIG.mode === 'serwer' && p.count > 1) {
        // Każda propozycja osobnym zapytaniem, równolegle: ten sam koszt, a pierwsza pokazuje się, gdy tylko jest gotowa.
        setResults([], p.prompt);
        let err = null;
        await Promise.all(Array.from({ length: p.count }, () => callApi('generate', { ...p, count: 1 })
          .then(r => { addResults(r.images, p.prompt); msg(`Gotowe ${results.length} z ${p.count}. Kliknij propozycję, którą chcesz użyć.`); })
          .catch(e => { err = e; })));
        if (!results.length) throw err;
        if (err) msg(`Gotowe ${results.length} z ${p.count} (pozostałe: ${err.message}). Kliknij propozycję, którą chcesz użyć.`);
        return;
      }
      const r = await callApi('generate', p);
      setResults(r.images, p.prompt);
      msg(r.demo ? (location.protocol.startsWith('http')
          ? 'AI niedostępne – brak połączenia z usługą AI. Pokazuję podglądy przykładowe.'
          : 'AI niedostępne – brak połączenia z serwerem. Pokazuję podglądy przykładowe.')
        : r.images.length > 1 ? 'Kliknij propozycję, którą chcesz użyć.' : 'Gotowe.', r.demo);
    } catch (e) { msg('Nie udało się: ' + e.message, true); }
    finally { setBusy(false); }
  }

  async function fix() {
    if (chosen < 0) return msg('Najpierw wybierz propozycję.', true);
    const fixText = $('aiFix').value.trim();
    if (!fixText) return msg('Wpisz, co poprawić.', true);
    setBusy(true); msg('Poprawiam wybraną propozycję…');
    try {
      const src = await blobToDataUrl(results[chosen].blob);
      const r = await callApi('edit', payload({ prompt: fixText, count: 1, source: src, reference: null }));
      setResults(r.images, fixText);
      msg('Gotowe. Możesz poprawić dalej albo użyć do podziału.');
    } catch (e) { msg('Nie udało się: ' + e.message, true); }
    finally { setBusy(false); }
  }

  // Przekazanie do podziału (tak samo jak przeciągnięcie pliku na pole zdjęcia). Podgląd i kadr od razu z propozycji,
  // powiększenie do wymiaru druku w tle; po nim plik podmienia się bez zmiany kadru. „Generuj bryty” w tym czasie czeka,
  // więc pliki do druku zawsze powstają z pełnej rozdzielczości.
  let pending = null, goWaiting = false;
  function setFile(blob, keepCrop) {
    const type = blob.type || 'image/png';
    const file = new File([blob], 'grafika-ai.' + (type === 'image/jpeg' ? 'jpg' : 'png'), { type });
    const input = $('file'), dt = new DataTransfer(); dt.items.add(file);
    window.keepCropOnce = !!keepCrop;   // bryty.html: nie resetuj kadru przy podmianie na większy plik
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.files[0];
  }
  // Czeka, aż bryty.html wczyta podmieniony plik (nowy obiekt img). Wynik: true = wczytany, false = błąd/limit czasu.
  // (Dawniej porównanie dokładnej szerokości: 1 px różnicy w nagłówku X-Width = 60 s czekania i „sukces” mimo błędu.)
  const loaded = before => new Promise(ok => { const t0 = Date.now(); (function chk() {
    const cur = typeof img !== 'undefined' ? img : null;
    if (cur && cur !== before) ok(true); else if (Date.now() - t0 > 60000) ok(false); else setTimeout(chk, 200); })(); });
  const currentImg = () => (typeof img !== 'undefined' ? img : null);
  let pendingFile = null, swapping = false;   // plik w polu zdjęcia, którego dotyczy trwające powiększanie

  async function use() {
    if (chosen < 0) return msg('Najpierw wybierz propozycję.', true);
    if (pending) return msg('Trwa powiększanie poprzednio wybranej propozycji – poczekaj na wynik (każde powiększenie kosztuje).', true);
    const prop = results[chosen], t = target();
    const mine = pendingFile = setFile(prop.blob, false);
    if (!(CONFIG.mode !== 'demo' && CONFIG.upscale)) {
      return msg(`Przekazano do podziału (${prop.width} × ${prop.height} px), bez powiększania. Do druku potrzeba ${fmt(t.wPx)} × ${fmt(t.hPx)} px – powiększanie (upscaling) jeszcze niepodłączone.`);
    }
    const job = pending = (async () => {
      let src = prop.blob;
      if (CONFIG.upscaler === 'lokalny' && src.type !== 'image/png') {   // lokalny Real-ESRGAN przyjmuje tylko PNG
        const bm = await createImageBitmap(src), cv = document.createElement('canvas');
        cv.width = bm.width; cv.height = bm.height; cv.getContext('2d').drawImage(bm, 0, 0); bm.close(); src = await toBlob(cv);
      }
      return (await callApi('upscale', payload({ count: 1, reference: null, source: await blobToDataUrl(src), sourceWidth: prop.width, sourceHeight: prop.height }))).images[0];
    })();
    qSync();   // w trakcie powiększania propozycji przycisk „Popraw jakość” jest ukryty (drugie płatne powiększenie)
    msg(`Podgląd gotowy – możesz już ustawiać kadr. W tle powiększam do druku (ok. ${fmt(t.wPx)} × ${fmt(t.hPx)} px, ` +
      ({ lokalny: 'może potrwać kilka minut' }[CONFIG.upscaler] || 'zwykle 1–3 min') + ').');
    try {
      const up = await job;
      if (pending !== job) {   // w międzyczasie wybrano inne zdjęcie (zmiana pliku zwolniła blokadę)
        if (/W tle powiększam/.test($('aiMsg').textContent)) msg('Powiększenie pominięte – w międzyczasie wybrano inne zdjęcie.');
        return;
      }
      const before = currentImg();
      swapping = true;
      try { pendingFile = setFile(up.blob, true); } finally { swapping = false; }
      const ok = await loaded(before);
      window.keepCropOnce = false;
      if (pending !== job) return;
      pending = null; pendingFile = null; qSync();
      // (Wynik bywa węższy od propozycji: przy małej ścianie powiększanie zmniejsza do wymiaru druku – to nie błąd.)
      if (!ok) throw new Error('Przeglądarka nie wczytała powiększonego pliku (za mało pamięci?).');
      msg(`Powiększono do ${fmt(up.width)} × ${fmt(up.height)} px. Pliki do druku powstaną z pełnej rozdzielczości.`);
      if (goWaiting) { goWaiting = false; $('go').click(); }
    } catch (e) {
      if (pending === job) { pending = null; pendingFile = null; qSync(); }
      goWaiting = false;
      msg('Powiększanie do druku nie udało się: ' + e.message + ' Podgląd jest z propozycji w małej rozdzielczości – do druku byłby za słaby.', true);
    }
  }

  // Przycisk „Popraw jakość (AI)” w ocenie jakości (jakosc.js): pokazuje się przy ocenie „Za słaba” albo „Akceptowalna”,
  // gdy serwer ma powiększanie. Powiększa wgrane zdjęcie (albo wzór z galerii) do wymiaru druku i podmienia je w polu zdjęcia.
  // Każde kliknięcie to płatne wywołanie, dlatego nie dzieje się samo.
  let qBusy = false, qSync = () => {};
  function qualityHook() {
    const badge = $('jqBadge'), text = $('jqText'); if (!badge || !text) return;
    const wrap = document.createElement('div'); wrap.id = 'aiQuality'; wrap.hidden = true;
    wrap.innerHTML = '<button type="button" class="small" id="aiQBtn">Popraw jakość (AI)</button>' +
      '<div class="hint" id="aiQHint">AI powiększy zdjęcie do wymiaru druku i wyostrzy szczegóły (w chmurze, zwykle 1–3 min). Każde powiększenie kosztuje.</div>' +
      '<div class="ai-msg" id="aiQMsg" role="status" aria-live="polite"></div>';
    text.after(wrap);
    qSync = () => {
      $('aiQHint').textContent = CONFIG.upscaler === 'lokalny'
        ? 'AI powiększy zdjęcie do wymiaru druku i wyostrzy szczegóły (bez opłat, może potrwać kilka minut).'
        : 'AI powiększy zdjęcie do wymiaru druku i wyostrzy szczegóły (w chmurze, zwykle 1–3 min). Każde powiększenie kosztuje.';
      wrap.hidden = !qBusy && (!!pending || !(CONFIG.upscale && /\bjq-(bad|ok)\b/.test(badge.className)));
    };
    new MutationObserver(qSync).observe(badge, { attributes: true, attributeFilter: ['class'] });
    wrap.addEventListener('click', e => { if (e.target.id === 'aiQBtn') improve(); });
  }
  async function improve() {
    const f = $('file').files[0]; if (!f || qBusy) return;
    const m = $('aiQMsg'), say = (t, err) => { m.textContent = t; m.className = 'ai-msg' + (err ? ' err' : ''); };
    if (pending) return say('Trwa powiększanie wybranej propozycji – poczekaj na wynik (każde powiększenie kosztuje).', true);
    const t = target();
    qBusy = true; $('aiQBtn').disabled = true;
    say(`Powiększam zdjęcie do ok. ${fmt(t.wPx)} × ${fmt(t.hPx)} px…`);
    try {
      const bm = await createImageBitmap(f);
      let src = f;
      // Lokalny Real-ESRGAN przyjmuje tylko PNG – wtedy JPG zamieniamy w przeglądarce.
      if (CONFIG.upscaler === 'lokalny' && f.type !== 'image/png') {
        const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height;
        cv.getContext('2d').drawImage(bm, 0, 0); src = await toBlob(cv);
      }
      const size = { w: bm.width, h: bm.height }; bm.close();
      const r = await callApi('upscale', { style: 'foto', count: 1, aspect: t.aspect, widthCm: t.wCm, heightCm: t.hCm,
        targetPx: { w: t.wPx, h: t.hPx }, source: await blobToDataUrl(src), sourceWidth: size.w, sourceHeight: size.h });
      if ($('file').files[0] !== f) return say('W międzyczasie wybrano inne zdjęcie – powiększenia nie podmieniono.', true);
      const out = r.images[0], type = out.blob.type || 'image/jpeg';
      // Ta sama nazwa pliku co oryginał – nazwa zlecenia się nie zmienia.
      const file = new File([out.blob], f.name.replace(/\.[^.]+$/, '') + (type === 'image/png' ? '.png' : '.jpg'), { type });
      const input = $('file'), dt = new DataTransfer(); dt.items.add(file);
      window.keepCropOnce = true;   // te same proporcje – kadr użytkownika zostaje
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      say(`Gotowe: zdjęcie ma teraz ${fmt(out.width)} × ${fmt(out.height)} px (było ${fmt(size.w)} × ${fmt(size.h)}). Obejrzyj fragment 1:1 poniżej.`);
    } catch (e) { say('Nie udało się: ' + e.message, true); }
    finally { qBusy = false; $('aiQBtn').disabled = false; qSync(); }
  }

  function refreshTarget() {
    const el = $('aiTarget'); if (!el) return;
    const t = target();
    el.innerHTML = `Do druku potrzeba: <b>${fmt(t.wPx)} × ${fmt(t.hPx)} px</b> (${t.wCm} × ${t.hCm} cm z naddatkami, ${t.dpi} DPI).`;
  }

  // Prawdziwe AI tylko przez lokalny serwer z kluczem (GET /api/health -> ai.generate).
  async function detect() {
    if (!location.protocol.startsWith('http')) return;
    try {
      const h = await (await fetch('/api/health')).json();
      const ai = h && h.ai;
      const el = $('aiMode'); if (!ai || !el) return;
      CONFIG.upscale = !!ai.upscale; CONFIG.upscaler = ai.upscaler; qSync();   // powiększanie działa też bez klucza OpenAI
      if (ai.generate) {
        CONFIG.mode = 'serwer';
        el.innerHTML = `<b>AI: ${esc(ai.provider)} (${esc(ai.model)}).</b> Opis i ewentualna inspiracja są wysyłane do OpenAI. Każda propozycja kosztuje – generuj tyle, ile potrzeba.`;
      } else el.innerHTML = '<b>AI niedostępne</b> – brak połączenia z usługą AI. Zamiast propozycji AI pojawią się podglądy przykładowe.';
    } catch { /* zostaje demo */ }
  }

  // Inspiracja służy tylko jako wskazówka stylu: wysyłamy ją pomniejszoną (maks. 2048 px), a nie np. 12 MB z telefonu
  // przy każdej z 4 propozycji. Mniejsze zdjęcie zostaje bez zmian.
  let refTok = 0;
  async function refDataUrl(f) {
    try {
      const bm = await createImageBitmap(f), k = Math.min(1, 2048 / Math.max(bm.width, bm.height));
      if (k === 1 && f.size < 4e6) { bm.close(); return blobToDataUrl(f); }
      const cv = document.createElement('canvas'); cv.width = Math.round(bm.width * k); cv.height = Math.round(bm.height * k);
      cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height); bm.close();
      return cv.toDataURL('image/jpeg', 0.92);
    } catch { return blobToDataUrl(f); }
  }

  function init() {
    const box = $('aiBox'); if (!box) return;
    // Inne zdjęcie w polu (własne, wzór z galerii) w trakcie powiększania: wynik powiększenia już nie dotyczy
    // tego zdjęcia, więc „Generuj bryty” nie może dalej na nie czekać.
    const fileIn = $('file');
    if (fileIn) fileIn.addEventListener('change', () => {
      if (pending && !swapping && fileIn.files[0] !== pendingFile) {
        pending = null; pendingFile = null; qSync();
        if (goWaiting) { goWaiting = false; msg('Wybrano inne zdjęcie – powiększanie propozycji AI pominięte. Kliknij „Generuj bryty” ponownie.'); }
      }
    });
    css(); build(); qualityHook(); detect();
    // „Generuj bryty” w trakcie powiększania: czekamy na pełną rozdzielczość i generujemy sami po jej nadejściu.
    const go = $('go');
    if (go) go.addEventListener('click', e => {
      if (!pending) return;
      e.stopImmediatePropagation(); e.preventDefault();
      goWaiting = true;
      msg('Pliki do druku wygenerują się same, gdy skończy się powiększanie do pełnej rozdzielczości.');
    }, true);
    box.addEventListener('click', e => {
      const zb = e.target.closest('.ai-zoom');
      if (zb) { viewer().show(+zb.dataset.z); return; }   // podgląd działa też, gdy reszta propozycji jeszcze się tworzy
      if (busy) return;
      const th = e.target.closest('.ai-thumb');
      if (th) { chosen = +th.dataset.i; showResults(); msg(''); return; }
      if (e.target.id === 'aiGen') generate();
      else if (e.target.id === 'aiFixBtn') fix();
      else if (e.target.id === 'aiUse') use();
    });
    box.addEventListener('dblclick', e => { const th = e.target.closest('.ai-thumb'); if (th) viewer().show(+th.dataset.i); });
    box.addEventListener('change', async e => {
      if (e.target.id !== 'aiRef') return;
      const f = e.target.files[0], tok = ++refTok;
      if (!f) { reference = null; $('aiRefInfo').innerHTML = ''; $('aiRefRights').hidden = true; return; }
      const dataUrl = await refDataUrl(f);
      if (tok !== refTok) return;   // w międzyczasie wybrano inne zdjęcie-inspirację
      reference = { dataUrl, name: f.name };
      $('aiRefInfo').innerHTML = `<div class="ai-ref"><img src="${reference.dataUrl}" alt=""><span>${esc(f.name)}</span></div>`;
      $('aiRefRights').hidden = false;
      $('aiStyle').value = 'ref';   // inny styl (np. „fotografia”) psułby podobieństwo do inspiracji
    });
    ['wallW', 'wallH', 'mT', 'mB', 'mL', 'mR', 'dpi'].forEach(id => { const el = $(id); if (el) { el.addEventListener('input', refreshTarget); el.addEventListener('change', refreshTarget); } });
  }

  return { init, callApi, target, CONFIG };
})();
GrafikaAI.init();
