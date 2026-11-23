// Zapamiętywanie ostatnich ustawień formularza w tej przeglądarce (localStorage).
// Nie zapisuje zdjęcia ani nazwy zlecenia. Przy otwarciu strony przywraca ustawienia,
// przycisk #resetSettings wraca do wartości domyślnych z formularza.
(() => {
  // v3 (31.10.2026): uwagi ARPI z 28.10 – naddatek 3 cm (2,5 + 0,5 spadu), zakład 6 cm, bez paska thru cut;
  // stare zapisy (2,5 cm, thru cut) nie wracają po otwarciu strony.
  const KEY = 'fototapety.ustawienia.v3';
  const $ = id => document.getElementById(id);
  const FIELDS = ['wallW', 'wallH', 'material', 'maxPrint', 'mT', 'mB', 'mL', 'mR', 'overlap', 'count', 'dpi', 'thru', 'pdf'];
  const RADIOS = ['join', 'split'];

  const read = () => {
    const s = { radios: {}, widths: [...document.querySelectorAll('#widthsBox input')].map(el => el.value) };
    FIELDS.forEach(id => { const el = $(id); if (el) s[id] = el.type === 'checkbox' ? el.checked : el.value; });
    // Kilka materiałów ma tę samą szerokość druku (value), więc materiał zapamiętujemy po nazwie.
    const m = $('material'); if (m && m.selectedIndex >= 0) s.materialName = m.options[m.selectedIndex].text;
    RADIOS.forEach(n => { const el = document.querySelector(`input[name=${n}]:checked`); if (el) s.radios[n] = el.value; });
    return s;
  };
  const write = s => {
    FIELDS.forEach(id => {
      const el = $(id); if (!el || !(id in s)) return;
      if (el.type === 'checkbox') el.checked = !!s[id];
      else if (el.tagName === 'SELECT' ? [...el.options].some(o => o.value === s[id]) : true) el.value = s[id];
    });
    const m = $('material'), mi = m ? [...m.options].findIndex(o => o.text === s.materialName) : -1;
    if (mi >= 0) m.selectedIndex = mi;
    RADIOS.forEach(n => { const el = s.radios && [...document.querySelectorAll(`input[name=${n}]`)].find(r => r.value === s.radios[n]); if (el) el.checked = true; });
    $('count').dispatchEvent(new Event('input', { bubbles: true }));   // główny skrypt odświeża podgląd i tworzy pola szerokości
    const ws = [...document.querySelectorAll('#widthsBox input')];
    if (s.widths && s.widths.length === ws.length) {
      ws.forEach((el, i) => { el.value = s.widths[i]; });
      $('widthsBox').dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(read())); } catch { /* przeglądarka bez zapisu */ } };

  const defaults = read();
  const saved = load();
  // Zapis uszkodzony albo z innej wersji (np. liczba zamiast obiektu) nie może zatrzymać strony – wtedy go kasujemy.
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    try { write(saved); } catch { try { localStorage.removeItem(KEY); } catch { /* bez zapisu */ } write(defaults); }
  } else if (saved !== null) { try { localStorage.removeItem(KEY); } catch { /* bez zapisu */ } }

  const panel = document.querySelector('.panel') || document.body;
  panel.addEventListener('input', e => { if (e.target.id !== 'order' && e.target.id !== 'file') save(); });
  panel.addEventListener('change', e => { if (e.target.id !== 'order' && e.target.id !== 'file') save(); });

  const btn = $('resetSettings');
  if (btn) btn.addEventListener('click', () => {
    try { localStorage.removeItem(KEY); } catch { /* bez zapisu */ }
    write(defaults);
    const note = $('resetNote'); if (note) { note.textContent = 'Przywrócono ustawienia domyślne.'; setTimeout(() => { note.textContent = ''; }, 3000); }
  });
})();
