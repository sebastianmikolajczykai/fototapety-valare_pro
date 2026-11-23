// Formularz logowania (przeniesiony z logowanie.html 06.11.2026 – CSP bez skryptów wpisanych w stronę).
  const $ = id => document.getElementById(id);
  $('f').addEventListener('submit', async e => {
    e.preventDefault();
    $('msg').classList.remove('on'); $('go').disabled = true;
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $('email').value, password: $('password').value }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) return location.replace(location.pathname + location.search);
      $('msg').textContent = d.error || 'Nie udało się zalogować.';
    } catch { $('msg').textContent = 'Brak połączenia z serwerem. Spróbuj ponownie.'; }
    $('msg').classList.add('on'); $('go').disabled = false;
  });
