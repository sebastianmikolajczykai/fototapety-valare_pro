// Wizualizacja we wnętrzu (sekcja 10) – odpowiednik starego wizualizacja.js. Dwa tryby (jak w FeltDecor):
//   1. Przykładowy pokój: typ wnętrza z listy; realistyczne zdjęcie robi tylko AI (klucz OpenAI tylko na serwerze).
//      Niewidoczny rysunek geometrii pokoju (szara ściana w wymiarach z kroku 1) idzie do AI jako referencja skali.
//   2. Moje wnętrze: zdjęcie klienta (zmniejszane do 1600 px), 4 narożniki obszaru fototapety, które można
//      przeciągać; fototapetę nakłada AI po kliknięciu „Stwórz wizualizację AI”. Sprawdzenie skali odcinkiem odniesienia.
// Hak w bryty.html: <div id="wizBox" class="step"></div>. Odświeża się sam, gdy główny skrypt przelicza podgląd
// (obserwuje #calc). Matematyka i teksty: src/domain/visualization.ts. Nie zmienia żadnych plików produkcyjnych.
import { computeLayout, fitImage, type Layout, type WallParams } from '../domain/layout';
import { validate } from '../domain/validation';
import {
  assessScale,
  grownQuad,
  homography,
  jpegSize,
  nearestPoint,
  photoStoreSize,
  photoViewSize,
  refPickLabel,
  ROOMS,
  scaleMessageHtml,
  SCENE_W,
  sceneGeo,
  vizAiInfoHtml,
  vizFileName,
  vizMessage,
  wallTextureRect,
  type Pt,
  type ScaleResult,
} from '../domain/visualization';
import { page } from './lib/legacy';

const CW = SCENE_W;
const f0 = (x: number): string => Math.round(x).toLocaleString('pl-PL');

type Current = { p: WallParams; err: true } | { p: WallParams; L: Layout; err?: undefined };
type VizWindow = Window & typeof globalThis & { grafikaId?: number };
type Ctx = CanvasRenderingContext2D;

// Punkt na brzegu płótna na półprostej z punktu zbiegu przez punkt (x, y).
function toEdge(vp: Pt, x: number, y: number, CH: number): Pt {
  const dx = x - vp.x;
  const dy = y - vp.y;
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (CW - vp.x) / dx);
  if (dx < 0) t = Math.min(t, -vp.x / dx);
  if (dy > 0) t = Math.min(t, (CH - vp.y) / dy);
  if (dy < 0) t = Math.min(t, -vp.y / dy);
  return { x: vp.x + dx * t, y: vp.y + dy * t };
}
function path(ctx: Ctx, list: readonly Pt[]): void {
  ctx.beginPath();
  list.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.closePath();
}
function poly(ctx: Ctx, list: readonly Pt[], fill: string | CanvasGradient): void {
  path(ctx, list);
  ctx.fillStyle = fill;
  ctx.fill();
}
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v =>
    Math.round(Math.max(0, Math.min(255, v + (f > 0 ? 255 - v : v) * f))),
  );
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
/** Ścieżka czworokąta odsuniętego od środka o grow px. */
function quadPath(ctx: Ctx, q: readonly Pt[], grow = 0): void {
  ctx.beginPath();
  grownQuad(q, grow).forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
  ctx.closePath();
}

// Rysunek geometrii pokoju dla AI: szara ściana w proporcjach, ściany boczne, sufit, podłoga. Nie jest pokazywany
// klientowi – AI dostaje go tylko jako referencję skali i perspektywy. Bez listew: fototapeta ma sięgać podłogi.
function drawRoom(ctx: Ctx, p: WallParams): void {
  const G = sceneGeo(p);
  const CH = G.CH;
  const SIDE = '#e7e4df';
  const CEIL = '#f6f5f2';
  const FLOOR = '#b08c68';
  const { x0, x1, y0, y1, w, h } = G;
  const vp = { x: G.cx, y: G.yh };
  const TL = { x: x0, y: y0 };
  const TR = { x: x1, y: y0 };
  const BR = { x: x1, y: y1 };
  const BL = { x: x0, y: y1 };
  const eTL = toEdge(vp, x0, y0, CH);
  const eTR = toEdge(vp, x1, y0, CH);
  const eBR = toEdge(vp, x1, y1, CH);
  const eBL = toEdge(vp, x0, y1, CH);
  const sg = ctx.createLinearGradient(0, 0, CW, 0);
  sg.addColorStop(0, shade(SIDE, -0.14));
  sg.addColorStop(0.5, SIDE);
  sg.addColorStop(1, shade(SIDE, -0.2));
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, CW, CH);
  const ceil = [eTL, TL, TR, eTR];
  if (eTR.y > 0.5) ceil.splice(4, 0, { x: CW, y: 0 });
  if (eTL.y > 0.5) ceil.push({ x: 0, y: 0 });
  poly(ctx, ceil, CEIL);
  const floor = [BL, BR, eBR];
  if (eBR.y < CH - 0.5) floor.push({ x: CW, y: CH });
  if (eBL.y < CH - 0.5) floor.push({ x: 0, y: CH });
  floor.push(eBL);
  const fg = ctx.createLinearGradient(0, y1, 0, CH);
  fg.addColorStop(0, shade(FLOOR, -0.16));
  fg.addColorStop(1, shade(FLOOR, 0.06));
  poly(ctx, floor, fg);
  // Deski podłogi (co 18 cm) zbiegające się w punkcie zbiegu – czytelna perspektywa.
  ctx.save();
  path(ctx, floor);
  ctx.clip();
  ctx.strokeStyle = 'rgba(60,40,20,.16)';
  ctx.lineWidth = 1;
  for (let X = -G.W / 2 - 1800; X <= G.W / 2 + 1800; X += 18) {
    const a = G.P(X, 0, 0);
    const e = toEdge(vp, a.x, a.y, CH);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#d9dcdf';
  ctx.fillRect(x0, y0, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(TL.x, TL.y);
  ctx.lineTo(BL.x, BL.y);
  ctx.moveTo(TR.x, TR.y);
  ctx.lineTo(BR.x, BR.y);
  ctx.stroke();
}

function dot(ctx: Ctx, q: Pt, label: string, fill: string): void {
  ctx.beginPath();
  ctx.arc(q.x, q.y, 11, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#222a35';
  ctx.stroke();
  if (label) {
    ctx.fillStyle = '#222a35';
    ctx.font = '600 12px Urbanist, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, q.x, q.y + 0.5);
  }
}

// Wygląd panelu (tekst stylu skopiowany 1:1 ze starego programu).
const CSS =
  '#wizBox { margin-top: 14px; border-top: 3px solid var(--v-green); }' +
  '#wizBox:empty { display: none; } #wizBox > h2 { font-weight: 300; margin-bottom: 4px; } #wizBox > h2 b { font-weight: 700; }' +
  '#wizBox .wiz-seg { grid-template-columns: 1fr 1fr; }' +
  '#wizBox .wiz-row { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; margin-top: 10px; }' +
  '#wizBox .wiz-row .check { margin-top: 0; } #wizBox .wiz-row[hidden], #wizBox .check[hidden], #wizScale[hidden], #wizBox .wiz-wrap[hidden] { display: none; }' +
  '#wizBox #wizRoomRow select { flex: 1 1 200px; max-width: 320px; }' +
  '#wizBox .wiz-file { display: inline-flex; align-items: center; height: 34px; padding: 0 14px; border: 1px solid var(--stage-line-strong, #222a35); font-size: 12px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--stage-text, #222a35); cursor: pointer; }' +
  '#wizBox .wiz-file:hover { background: var(--stage-hover, #e6f7f3); } #wizBox .wiz-file input { position: absolute; width: 1px; height: 1px; opacity: 0; }' +
  '#wizBox .wiz-wrap { margin-top: 12px; border: 1px solid var(--stage-line, #e3e5e8); background: #f4f5f6; }' +
  '#wizCanvas { display: block; width: 100%; height: auto; touch-action: none; }' +
  '#wizBox #wizMsg { margin-top: 8px; }' +
  '#wizScale { margin-top: 12px; padding: 10px 12px; border: 1px solid var(--stage-line, #e3e5e8); }' +
  '#wizScale .wiz-sub { font-weight: 600; } #wizScale .wiz-sub span { font-weight: 400; color: #5d6470; }' +
  '#wizScale .wiz-len { display: inline-flex; align-items: center; gap: 6px; } #wizScale .wiz-len input { width: 90px; }' +
  '#wizScaleOut > div { margin-top: 8px; } #wizScaleOut .ok { color: #16806a; font-weight: 600; } #wizScaleOut .warn { color: #a05a00; }' +
  '#wizBox .wiz-ai { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--stage-line, #e3e5e8); }' +
  '#wizBox #wizAi { width: 100%; } #wizBox #wizAiInfo { margin-top: 8px; }' +
  '#wizBox #wizAiOut img { display: block; width: 100%; height: auto; margin-top: 10px; border: 1px solid var(--stage-line, #e3e5e8); }' +
  '#wizBox #wizAiOut a { display: inline-block; margin-top: 8px; color: var(--link, #16806a); font-weight: 600; }';

export class InteriorPreview {
  private mode = 'pokoj';
  private room = 'salon';
  private photo: HTMLCanvasElement | null = null;
  private pts: Pt[] = [];
  private dragIdx = -1;
  private ref: Pt[] = [];
  private refPicking = false;
  private refDrag = -1;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastMsg = '';
  private dragFrame = 0;
  /** Dwa zdjęcia wybrane szybko po sobie: wygrywa ostatnio wybrane, nie ostatnio wczytane. */
  private photoSeq = 0;
  private aiReady = false;
  private aiBusy = false;
  private aiUrl: string | null = null;

  constructor(private readonly win: VizWindow) {}

  private get doc(): Document {
    return this.win.document;
  }
  private $<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return this.doc.getElementById(id) as T | null;
  }

  // ---------- Kadr ściany (bez naddatków) jako obraz ----------
  private current(): Current {
    const p = page.params();
    if (validate(p).length) return { p, err: true };
    return { p, L: computeLayout(p) };
  }

  private wallTexture(p: WallParams, L: Layout): HTMLCanvasElement | null {
    const img = page.img();
    if (!img) return null;
    const R = wallTextureRect(p, L);
    if (!R) return null;
    const F = fitImage(L, img.naturalWidth, img.naturalHeight, page.crop());
    const cv = this.doc.createElement('canvas');
    cv.width = R.w;
    cv.height = R.h;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      img,
      (R.X0 + F.cx) / F.s,
      (R.Y0 - L.band + F.cy) / F.s,
      (R.X1 - R.X0) / F.s,
      (R.Y1 - R.Y0) / F.s,
      0,
      0,
      cv.width,
      cv.height,
    );
    return cv;
  }

  private photoSize(): { W: number; H: number } {
    return photoViewSize(this.photo!.width, this.photo!.height);
  }

  // Na zdjęciu tylko punkty i obrys – grafikę nakłada AI dopiero po kliknięciu przycisku (Sebastian 2026-10-27).
  private drawPhoto(ctx: Ctx, cv: HTMLCanvasElement, handles: boolean): void {
    const { W, H } = this.photoSize();
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    ctx.drawImage(this.photo!, 0, 0, W, H);
    const quad = this.pts.map(q => ({ x: q.x * W, y: q.y * H }));
    if (!handles) return;
    // Obrys jak w FeltDecor: żółta przerywana linia, odcinek odniesienia zielony.
    ctx.save();
    if (quad.length) {
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = '#ffd400';
      ctx.beginPath();
      quad.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      if (quad.length === 4) ctx.closePath();
      ctx.stroke();
      if (quad.length === 4) {
        path(ctx, quad);
        ctx.fillStyle = 'rgba(0,140,255,.28)';
        ctx.fill();
      }
    }
    if (this.ref.length) {
      const r = this.ref.map(q => ({ x: q.x * W, y: q.y * H }));
      if (r.length === 2) {
        ctx.strokeStyle = '#1fd65f';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.moveTo(r[0]!.x, r[0]!.y);
        ctx.lineTo(r[1]!.x, r[1]!.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      r.forEach(q => dot(ctx, q, '', '#1fd65f'));
    }
    ctx.setLineDash([]);
    quad.forEach((q, i) => dot(ctx, q, String(i + 1), '#ffd400'));
    ctx.restore();
  }

  // ---------- Rysowanie i interfejs ----------
  private scaleInfo(st: Current): ScaleResult | null {
    if (!(!st.err && this.photo && this.pts.length === 4)) return null;
    const { W, H } = this.photoSize();
    const lenEl = this.$<HTMLInputElement>('wizRefLen');
    const len = Number(lenEl && lenEl.value);
    return assessScale({
      points: this.pts,
      photoWidth: W,
      photoHeight: H,
      wallW: st.p.wallW,
      wallH: st.p.wallH,
      reference:
        this.ref.length === 2 && len >= 10 && len <= 2000 ? { a: this.ref[0]!, b: this.ref[1]!, length: len } : null,
    });
  }

  /** Rysuje panel i zwraca komunikat pod nim. */
  draw(cv: HTMLCanvasElement, handles: boolean): string {
    const ctx = cv.getContext('2d')!;
    const st = this.current();
    const own = this.mode === 'wnetrze';
    if (own) {
      if (!this.photo) {
        if (cv.width !== CW || cv.height !== Math.round(CW * 0.45)) {
          cv.width = CW;
          cv.height = Math.round(CW * 0.45);
        }
        ctx.fillStyle = '#f4fbf9';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = '#5d6470';
        ctx.font = '22px Urbanist, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Wgraj zdjęcie swojego wnętrza', cv.width / 2, cv.height / 2);
      } else this.drawPhoto(ctx, cv, handles);
    }
    return vizMessage({
      own,
      hasPhoto: !!this.photo,
      points: this.pts.length,
      refPicking: this.refPicking,
      refPoints: this.ref.length,
      valid: !st.err,
      hasImage: !!page.img(),
      wallW: st.p.wallW,
      wallH: st.p.wallH,
    });
  }

  private syncScale(st: Current): void {
    const box = this.$('wizScale');
    if (!box) return;
    box.hidden = !(this.mode === 'wnetrze' && this.photo && this.pts.length === 4);
    if (box.hidden) return;
    const ok = !st.err;
    this.$('wizScaleIntro')!.textContent = ok
      ? `Zaznaczony obszar będzie miał w rzeczywistości wymiar ściany: ${f0(st.p.wallW)} × ${f0(st.p.wallH)} cm.`
      : '';
    this.$('wizRefPick')!.textContent = refPickLabel(this.refPicking, this.ref.length);
    const out = this.$('wizScaleOut')!;
    const html = scaleMessageHtml(this.scaleInfo(st) ?? { ok: false }, st.p, this.ref.length);
    if (out.innerHTML !== html) out.innerHTML = html;
  }

  refresh(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const cv = this.$<HTMLCanvasElement>('wizCanvas');
      if (!cv) return;
      const msg = this.draw(cv, true);
      if (msg !== this.lastMsg) {
        this.$('wizMsg')!.textContent = msg;
        this.lastMsg = msg;
      }
      const own = this.mode === 'wnetrze';
      this.$('wizRoomRow')!.hidden = own;
      this.$('wizPhotoRow')!.hidden = !own;
      this.$('wizWrap')!.hidden = !own;
      this.$<HTMLButtonElement>('wizUndo')!.disabled = !this.photo || (!this.pts.length && !this.ref.length);
      this.$<HTMLButtonElement>('wizRedo')!.disabled = !this.photo || !this.pts.length;
      cv.style.cursor = own && this.photo && (this.pts.length < 4 || this.refPicking) ? 'crosshair' : '';
      this.syncScale(this.current());
      this.syncAi();
    }, 60);
  }

  private build(): void {
    const box = this.$('wizBox')!;
    box.innerHTML =
      '<h2>Wizualizacja <b>we wnętrzu</b></h2>' +
      '<div class="hint">Kadr na ścianie (bez naddatku). Tylko dla klienta – nie zmienia plików do produkcji. Do OpenAI idzie obraz tylko po kliknięciu „Stwórz wizualizację AI”.</div>' +
      '<div class="radios seg wiz-seg" role="radiogroup" aria-label="Wnętrze">' +
      '<label class="radio"><input type="radio" name="wizMode" value="pokoj" checked> Przykładowy pokój</label>' +
      '<label class="radio"><input type="radio" name="wizMode" value="wnetrze"> Moje wnętrze</label></div>' +
      '<div id="wizRoomRow" class="wiz-row"><label for="wizRoom">Typ wnętrza</label><select id="wizRoom">' +
      Object.entries(ROOMS)
        .map(([id, n]) => `<option value="${id}"${id === this.room ? ' selected' : ''}>${n}</option>`)
        .join('') +
      '</select></div>' +
      '<div id="wizPhotoRow" class="wiz-row" hidden><label class="wiz-file small-btn"><input id="wizFile" type="file" accept="image/jpeg,image/png,image/webp"> Wgraj zdjęcie wnętrza</label>' +
      '<button id="wizUndo" class="small" type="button">Cofnij punkt</button><button id="wizRedo" class="small" type="button">Zaznacz ponownie</button></div>' +
      '<div id="wizWrap" class="wiz-wrap" hidden><canvas id="wizCanvas" width="' +
      CW +
      '" height="' +
      Math.round(CW * 0.6) +
      '"></canvas></div>' +
      '<div id="wizMsg" class="hint" role="status" aria-live="polite"></div>' +
      '<div id="wizScale" hidden><div class="wiz-sub">Sprawdź skalę <span>(opcjonalnie)</span></div><div id="wizScaleIntro" class="hint"></div>' +
      '<div class="hint">Zaznacz na tej samej ścianie coś o znanym wymiarze (np. wysokość drzwi, szerokość okna) i wpisz jego długość.</div>' +
      '<div class="wiz-row"><button id="wizRefPick" class="small" type="button">Zaznacz odcinek odniesienia</button>' +
      '<label class="wiz-len">Długość odcinka <input id="wizRefLen" type="number" min="10" max="2000" step="1" inputmode="numeric"> cm</label></div>' +
      '<div id="wizScaleOut" role="status" aria-live="polite"></div></div>' +
      '<div class="wiz-ai"><button id="wizAi" type="button" disabled>Stwórz wizualizację AI</button>' +
      '<div id="wizAiInfo" class="hint"></div><div id="wizAiMsg" class="msg" role="status" aria-live="polite"></div><div id="wizAiOut"></div></div>';
    const css = this.doc.createElement('style');
    css.textContent = CSS;
    this.doc.head.appendChild(css);
  }

  private canvasPt(e: PointerEvent): Pt {
    const r = this.$('wizCanvas')!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  // Zdjęcie klienta zmniejszone do 1600 px (dłuższy bok), jak w FeltDecor.
  private loadPhoto(f: File): void {
    const im = new Image();
    const u = URL.createObjectURL(f);
    const seq = ++this.photoSeq;
    im.onload = (): void => {
      if (seq !== this.photoSeq) {
        URL.revokeObjectURL(u);
        return;
      }
      const s = photoStoreSize(im.naturalWidth, im.naturalHeight);
      const c = this.doc.createElement('canvas');
      c.width = s.w;
      c.height = s.h;
      const x = c.getContext('2d')!;
      x.imageSmoothingQuality = 'high';
      x.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      this.photo = c;
      this.pts = [];
      this.ref = [];
      this.refPicking = false;
      this.refresh();
    };
    im.onerror = (): void => {
      URL.revokeObjectURL(u);
      if (seq !== this.photoSeq) return;
      this.$('wizMsg')!.textContent = 'Nie udało się wczytać zdjęcia (JPG, PNG albo WEBP).';
      this.lastMsg = '';
    };
    im.src = u;
  }

  // ---------- Wizualizacja AI (OpenAI przez serwer, klucz tylko na serwerze) ----------
  // Czyste zdjęcie, zdjęcie z zaznaczonym czworokątem (jak w FeltDecor) i maska edycji
  // (PNG, ten sam wymiar co zdjęcie; przezroczysty czworokąt = obszar do zmiany – wg dokumentacji OpenAI).
  private photoInputs(): {
    W: number;
    H: number;
    base: HTMLCanvasElement;
    quad: Pt[];
    photo: string;
    guide: string;
    mask: string;
  } {
    const { W, H } = this.photoSize();
    const mk = (): HTMLCanvasElement => {
      const c = this.doc.createElement('canvas');
      c.width = W;
      c.height = H;
      return c;
    };
    const base = mk();
    base.getContext('2d')!.drawImage(this.photo!, 0, 0, W, H);
    const quad = this.pts.map(q => ({ x: q.x * W, y: q.y * H }));
    const guide = mk();
    const g = guide.getContext('2d')!;
    g.drawImage(base, 0, 0);
    g.fillStyle = 'rgba(60,0,0,.6)';
    g.fillRect(0, 0, W, H);
    g.save();
    quadPath(g, quad);
    g.clip();
    g.drawImage(base, 0, 0);
    g.fillStyle = 'rgba(0,255,0,.45)';
    g.fillRect(0, 0, W, H);
    g.restore();
    g.strokeStyle = '#00ff00';
    g.lineWidth = 3;
    quadPath(g, quad);
    g.stroke();
    quad.forEach((q, i) => {
      g.beginPath();
      g.arc(q.x, q.y, 14, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#000';
      g.font = 'bold 16px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(i + 1), q.x, q.y + 1);
    });
    const mask = mk();
    const m = mask.getContext('2d')!;
    m.fillStyle = '#000';
    m.fillRect(0, 0, W, H);
    m.globalCompositeOperation = 'destination-out';
    quadPath(m, quad, 1);
    m.fill();
    return {
      W,
      H,
      base,
      quad,
      photo: base.toDataURL('image/jpeg', 0.9),
      guide: guide.toDataURL('image/jpeg', 0.9),
      mask: mask.toDataURL('image/png'),
    };
  }
  // Wynik AI na zdjęciu klienta: poza czworokątem zawsze oryginalne zdjęcie (maska OpenAI może nie być ścisła).
  private keepOutside(
    resultImg: HTMLImageElement,
    inp: { W: number; H: number; base: HTMLCanvasElement; quad: Pt[] },
  ): Promise<Blob> {
    const c = this.doc.createElement('canvas');
    c.width = inp.W;
    c.height = inp.H;
    const x = c.getContext('2d')!;
    x.drawImage(inp.base, 0, 0);
    x.save();
    quadPath(x, inp.quad, 2);
    x.clip();
    x.drawImage(resultImg, 0, 0, inp.W, inp.H);
    x.restore();
    return new Promise(res => c.toBlob(b => res(b!), 'image/png'));
  }
  private jpeg(cv: HTMLCanvasElement, max: number): string {
    const s = jpegSize(cv.width, cv.height, max);
    if (!s) return cv.toDataURL('image/jpeg', 0.9);
    const c = this.doc.createElement('canvas');
    c.width = s.w;
    c.height = s.h;
    c.getContext('2d')!.drawImage(cv, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.9);
  }

  private async checkAi(): Promise<void> {
    type Health = { ai?: { generate?: boolean; provider?: unknown; model?: unknown } } | null;
    let h: Health;
    try {
      h = this.win.location.protocol.startsWith('http')
        ? ((await (await this.win.fetch('/api/health')).json()) as Health)
        : null;
    } catch {
      h = null;
    }
    this.aiReady = !!(h && h.ai && h.ai.generate);
    this.$('wizAiInfo')!.innerHTML = vizAiInfoHtml(h);
    this.syncAi();
  }
  private syncAi(): void {
    const b = this.$<HTMLButtonElement>('wizAi');
    if (!b) return;
    b.disabled =
      !this.aiReady || this.aiBusy || !page.img() || (this.mode === 'wnetrze' && (!this.photo || this.pts.length < 4));
    b.textContent = this.aiBusy ? 'Generuję… (zwykle do kilku minut)' : 'Stwórz wizualizację AI';
  }

  private async generateAi(): Promise<void> {
    const st = this.current();
    if (!this.aiReady || this.aiBusy || st.err || !page.img()) return;
    const tex = this.wallTexture(st.p, st.L);
    if (!tex) return;
    const own = this.mode === 'wnetrze';
    let req: Record<string, unknown>;
    let inp: ReturnType<InteriorPreview['photoInputs']> | null = null;
    if (own) {
      if (!this.photo || this.pts.length < 4) return;
      inp = this.photoInputs();
      req = { mode: 'photo', photo: inp.photo, guide: inp.guide, mask: inp.mask, aspect: inp.W / inp.H };
    } else {
      req = { mode: 'scene', room: this.room, geometry: this.geometry(), aspect: CW / sceneGeo(st.p).CH };
    }
    req.mural = this.jpeg(tex, 1536);
    req.wallW = st.p.wallW;
    req.wallH = st.p.wallH;
    this.aiBusy = true;
    this.syncAi();
    const srcId = this.win.grafikaId; // wynik dotyczy grafiki i typu wnętrza z chwili kliknięcia
    const reqRoom = this.room;
    this.$('wizAiMsg')!.innerHTML = '';
    try {
      const r = await this.win.fetch('/api/ai/interior', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!r.ok) throw new Error((await r.text()) || `Błąd ${r.status}`);
      const j = (await r.json()) as { image: { dataUrl: string } };
      let blob = await (await this.win.fetch(j.image.dataUrl)).blob();
      if (this.win.grafikaId !== srcId)
        throw new Error('w międzyczasie zmieniono grafikę – kliknij ponownie, żeby zobaczyć nową');
      if (inp) {
        const im = new Image();
        const u = URL.createObjectURL(blob);
        im.src = u;
        try {
          await im.decode();
          blob = await this.keepOutside(im, inp);
        } finally {
          URL.revokeObjectURL(u);
        }
      }
      if (this.aiUrl) URL.revokeObjectURL(this.aiUrl);
      this.aiUrl = URL.createObjectURL(blob);
      const name = vizFileName(page.params().order, own, reqRoom);
      this.$('wizAiOut')!.innerHTML =
        `<img src="${this.aiUrl}" alt="Wizualizacja AI we wnętrzu">` +
        `<a href="${this.aiUrl}" download="${name}">Pobierz wizualizację AI (PNG)</a>`;
    } catch (e) {
      const err = e as Error;
      this.$('wizAiMsg')!.innerHTML =
        `<div class="err">Wizualizacja AI nie powiodła się: ${String(err.message || err).replace(/</g, '&lt;')}</div>`;
    } finally {
      this.aiBusy = false;
      this.syncAi();
    }
  }

  init(): void {
    const box = this.$('wizBox');
    if (!box) return;
    this.build();
    const stop = (e: Event): void => e.stopPropagation(); // zmiany w panelu nie przeliczają reszty strony
    box.addEventListener('input', e => {
      stop(e);
      if ((e.target as HTMLElement).id === 'wizRefLen') this.refresh();
    });
    box.addEventListener('change', e => {
      const t = e.target as HTMLInputElement;
      stop(e);
      if (t.name === 'wizMode') {
        this.mode = t.value;
        this.refPicking = false;
      } else if (t.id === 'wizRoom') this.room = t.value;
      else if (t.id === 'wizFile') {
        const f = t.files && t.files[0];
        if (f) this.loadPhoto(f);
        t.value = '';
        return;
      }
      this.refresh();
    });
    this.$('wizUndo')!.addEventListener('click', () => {
      if (this.refPicking || this.ref.length) {
        // Najpierw odcinek odniesienia.
        this.ref.pop();
        this.refPicking = this.ref.length === 1;
      } else this.pts.pop();
      this.refresh();
    });
    this.$('wizRedo')!.addEventListener('click', () => {
      this.pts = [];
      this.ref = [];
      this.refPicking = false;
      this.refresh();
    });
    this.$('wizRefPick')!.addEventListener('click', () => {
      this.ref = [];
      this.refPicking = true;
      this.refresh();
    });
    this.$('wizAi')!.addEventListener('click', () => void this.generateAi());
    void this.checkAi();
    // Moje wnętrze: klik dodaje kolejny narożnik, potem punkty się przeciąga; w trybie odcinka odniesienia
    // 2 kliknięcia wyznaczają odcinek, jego końce też można przeciągać.
    const cv = this.$<HTMLCanvasElement>('wizCanvas')!;
    cv.addEventListener('pointerdown', e => {
      if (this.mode !== 'wnetrze' || !this.photo || (e.button != null && e.button !== 0)) return;
      const q = this.canvasPt(e);
      const r = cv.getBoundingClientRect();
      const grab = (): void => {
        cv.setPointerCapture(e.pointerId);
        e.preventDefault();
      };
      const ri = this.ref.length === 2 ? nearestPoint(this.ref, q, r.width, r.height) : -1;
      if (ri >= 0) {
        this.refDrag = ri;
        return grab();
      }
      if (this.refPicking && this.pts.length === 4) {
        e.preventDefault();
        this.ref.push(q);
        if (this.ref.length >= 2) this.refPicking = false;
        return this.refresh();
      }
      const i = nearestPoint(this.pts, q, r.width, r.height);
      if (i >= 0) {
        this.dragIdx = i;
        return grab();
      }
      if (this.pts.length >= 4) return;
      e.preventDefault();
      this.pts.push(q);
      this.refresh();
    });
    cv.addEventListener('pointermove', e => {
      if (this.dragIdx < 0 && this.refDrag < 0) return;
      const q = this.canvasPt(e);
      if (this.refDrag >= 0) this.ref[this.refDrag] = q;
      else this.pts[this.dragIdx] = q;
      // Narożnik idzie za kursorem: rysunek co klatkę (refresh() czeka 60 ms na koniec ruchu), pełne odświeżenie po ruchu.
      if (!this.dragFrame)
        this.dragFrame = requestAnimationFrame(() => {
          this.dragFrame = 0;
          const c = this.$<HTMLCanvasElement>('wizCanvas');
          if (c) this.draw(c, true);
        });
      this.refresh();
    });
    for (const ev of ['pointerup', 'pointercancel'])
      cv.addEventListener(ev, () => {
        this.dragIdx = -1;
        this.refDrag = -1;
      });
    // Główny skrypt przepisuje #calc przy każdym przeliczeniu (wymiary, kadr, bryty) – wtedy odświeżamy scenę.
    const calc = this.$('calc');
    if (calc)
      new MutationObserver(() => this.refresh()).observe(calc, { childList: true, characterData: true, subtree: true });
    const file = this.$('file');
    if (file) file.addEventListener('change', () => setTimeout(() => this.refresh(), 300));
    this.refresh();
  }

  /** Rysunek geometrii pokoju wysyłany do AI (JPG jako data URL); null = błędne ustawienia. */
  geometry(): string | null {
    const st = this.current();
    if (st.err) return null;
    const G = sceneGeo(st.p);
    const c = this.doc.createElement('canvas');
    c.width = CW;
    c.height = G.CH;
    drawRoom(c.getContext('2d')!, st.p);
    return c.toDataURL('image/jpeg', 0.9);
  }

  state(): { mode: string; room: string; pts: Pt[]; ref: Pt[]; refPicking: boolean; hasPhoto: boolean } {
    return {
      mode: this.mode,
      room: this.room,
      pts: this.pts.slice(),
      ref: this.ref.slice(),
      refPicking: this.refPicking,
      hasPhoto: !!this.photo,
    };
  }
}

// Pomost dla skryptów, które jeszcze nie są przepisane, i testów (homografia w starym kształcie: funkcja z polem m).
const viz = new InteriorPreview(window as VizWindow);
Object.assign(window, {
  Wizualizacja: {
    init: () => viz.init(),
    refresh: () => viz.refresh(),
    homography: (q: Pt[]) => {
      const h = homography(q);
      if (!h) return null;
      return Object.assign((u: number, v: number) => h.map(u, v), { m: h.m });
    },
    assessScale,
    sceneGeo,
    geometry: () => viz.geometry(),
    _state: () => viz.state(),
  },
});
viz.init();
