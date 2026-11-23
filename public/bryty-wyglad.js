// Warstwa interfejsu bryty.html (przeniesiona z HTML 06.11.2026 – CSP bez skryptów wpisanych w stronę).
// Warstwa interfejsu (wygląd Valare): przeciąganie zdjęcia, przyciski −/+ powiększenia, stan pola zdjęcia.
// Nie liczy niczego sama – przekazuje zdarzenia do pól, które obsługuje główny skrypt.
(() => {
  const $ = id => document.getElementById(id);
  const file = $('file'), drop = $('drop'), zoom = $('zoom');

  // Przeciągnij i upuść zdjęcie na pole „Wybierz zdjęcie”.
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'dragend', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    const f = [...(e.dataTransfer.files || [])].find(x => /^image\/(jpeg|png)$/.test(x.type));
    if (!f) { $('imgInfo').innerHTML = '<span class="err">To nie jest plik JPG ani PNG.</span>'; return; }
    const dt = new DataTransfer(); dt.items.add(f);
    file.files = dt.files;
    file.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // Upuszczenie pliku obok pola nie otwiera go w przeglądarce (nie gubi ustawień).
  ['dragover', 'drop'].forEach(ev => window.addEventListener(ev, e => { if (!drop.contains(e.target)) e.preventDefault(); }));

  // Domyślna nazwa zlecenia: „Fototapeta 350x270 26.10.2026” (wymiar ściany i data) zamiast nazwy pliku zdjęcia.
  // Idzie za wymiarem ściany, dopóki użytkownik nie wpisze własnej (np. nazwiska klienta).
  let orderTyped = false;
  const autoOrder = () => {
    if (orderTyped) return;
    const w = num($('wallW').value), h = num($('wallH').value);
    $('order').value = 'Fototapeta' + (w > 0 && h > 0 ? ` ${w}x${h}` : '') + ' ' + new Date().toLocaleDateString('pl-PL');
  };
  $('order').addEventListener('input', e => { if (e.isTrusted) orderTyped = $('order').value.trim() !== ''; autoOrder(); });
  // Każda zmiana w formularzu (też przywrócenie ustawień przez pamiec.js) odświeża domyślną nazwę.
  document.addEventListener('input', e => { if (e.target.id !== 'order') autoOrder(); });
  autoOrder();
  file.addEventListener('change', () => {
    if (!file.files[0]) return;
    $('dropTitle').textContent = 'Zmień zdjęcie'; drop.classList.add('has-file');
  });

  // Powiększenie: −/+ o 10 punktów procentowych w granicach suwaka.
  const step = d => {
    const v = Math.min(+zoom.max, Math.max(+zoom.min, Math.round(+zoom.value) + d));
    if (v === +zoom.value) return;
    zoom.value = v;
    zoom.dispatchEvent(new Event('input', { bubbles: true }));
  };
  $('zoomOut').addEventListener('click', () => step(-10));
  $('zoomIn').addEventListener('click', () => step(10));
  const sync = () => { $('zoomOut').disabled = +zoom.value <= +zoom.min; $('zoomIn').disabled = +zoom.value >= +zoom.max; };
  // Główny skrypt wpisuje aktualne powiększenie do #zoomVal przy każdym odświeżeniu podglądu.
  new MutationObserver(sync).observe($('zoomVal'), { childList: true, characterData: true, subtree: true });
  sync();
})();
