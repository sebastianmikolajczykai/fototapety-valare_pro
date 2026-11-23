// Formularz logowania (logowanie.html) – odpowiednik starego logowanie-strona.js. Serwer pokazuje ten ekran
// zamiast konfiguratora, gdy ma hasło aplikacji (APP_PASSWORD); po udanym logowaniu strona się przeładowuje.

export class LoginForm {
  constructor(
    private readonly doc: Document,
    private readonly loc: Location,
    private readonly fetchFn: typeof fetch,
  ) {}

  private el<T extends HTMLElement = HTMLInputElement>(id: string): T {
    return this.doc.getElementById(id) as T;
  }

  private async submit(): Promise<void> {
    const msg = this.el<HTMLElement>('msg');
    const go = this.el<HTMLButtonElement>('go');
    msg.classList.remove('on');
    go.disabled = true;
    try {
      const r = await this.fetchFn('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.el('email').value, password: this.el('password').value }),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (r.ok && d.ok) return this.loc.replace(this.loc.pathname + this.loc.search);
      msg.textContent = d.error || 'Nie udało się zalogować.';
    } catch {
      msg.textContent = 'Brak połączenia z serwerem. Spróbuj ponownie.';
    }
    msg.classList.add('on');
    go.disabled = false;
  }

  start(): void {
    this.el<HTMLFormElement>('f').addEventListener('submit', e => {
      e.preventDefault();
      void this.submit();
    });
  }
}

new LoginForm(document, location, (...a) => fetch(...a)).start();
