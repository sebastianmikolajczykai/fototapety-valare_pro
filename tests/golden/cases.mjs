// Wejścia do nagrania wzorców ze starego programu. Losowe, ale powtarzalne (stałe ziarno).
const rng = (seed => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
})(20261123);
const pick = a => a[Math.floor(rng() * a.length)];
const r1 = x => Math.round(x * 10) / 10;

const MARGINS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7.5, 9.5, 10];
const MAXPRINT = [100, 121, 124, 130, 131, 132, 135, 146, 154, 194, 94, Infinity, Infinity, NaN, 0, 50];
const base = {
  wallW: 350,
  wallH: 270,
  mT: 3,
  mB: 3,
  mL: 3,
  mR: 3,
  join: 'overlap',
  overlap: 6,
  split: 'equal',
  count: 3,
  widths: [122.7, 122.7, NaN],
  maxPrint: 131,
  dpi: 150,
  thru: false,
  pdf: true,
  order: 'Fototapeta',
  orderName: 'Fototapeta',
};
const P = o => ({ ...base, ...o });

// Ustawienia nazwane: wzorzec drukarni 005-21 i plik dla ARPI 31.10 (325×245).
const named = [
  P({}),
  P({ thru: true }),
  P({ wallW: 325, wallH: 245 }),
  P({ wallW: 325, wallH: 245, join: 'butt', overlap: 1 }),
  P({ wallW: 325, wallH: 245, dpi: 300 }),
  P({ wallW: 350, wallH: 270, dpi: 200 }),
  P({ count: 1, wallW: 120 }),
  P({ count: 30, wallW: 3000 }),
  P({ split: 'custom', widths: [100, 120, NaN] }),
  P({ split: 'custom', widths: [130, 130, 104] }),
  P({ split: 'custom', widths: [200, 200, NaN] }),
  P({ split: 'custom', widths: [100, 100, 100] }),
  P({ split: 'custom', count: 4, widths: [100, 100, 100, NaN] }),
  P({ split: 'custom', count: 2, widths: [355, NaN] }),
  P({ wallH: 600, dpi: 300 }),
  P({ wallH: 541, dpi: 150 }),
  P({ wallH: 0.5, thru: true, mT: 0, mB: 0 }),
  P({ wallW: 1000, count: 8, maxPrint: 131 }),
  P({ maxPrint: NaN }),
  P({ dpi: 40 }),
  P({ count: 0 }),
  P({ count: 31 }),
  P({ mT: 0.3 }),
  P({ mL: 11 }),
  P({ overlap: -1 }),
  P({ wallW: 0 }),
  P({ wallW: NaN }),
  P({ overlap: 200, count: 3 }),
  P({ wallW: 300, mL: 0, mR: 0, count: 3, overlap: 0 }),
  P({ wallW: 2000, wallH: 300, count: 2, maxPrint: Infinity, dpi: 300 }),
];

function randomParams() {
  const join = rng() < 0.25 ? 'butt' : 'overlap';
  const split = rng() < 0.35 ? 'custom' : 'equal';
  const count = rng() < 0.05 ? pick([0, 31, NaN, 30]) : 1 + Math.floor(rng() * 12);
  const wallW = rng() < 0.03 ? pick([0, -5, NaN]) : r1(20 + rng() * 1400);
  const wallH = rng() < 0.03 ? pick([0, NaN]) : r1(30 + rng() * (rng() < 0.1 ? 2500 : 400));
  const m = () => (rng() < 0.04 ? pick([10.5, 0.3, -1, NaN]) : pick(MARGINS));
  const overlap = join === 'butt' ? 1 : rng() < 0.04 ? pick([-1, NaN]) : pick([0, 1, 2.5, 5, 6, 6, 10]);
  const p = {
    ...base,
    wallW,
    wallH,
    mT: m(),
    mB: m(),
    mL: m(),
    mR: m(),
    join,
    overlap,
    split,
    count,
    maxPrint: pick(MAXPRINT),
    dpi: rng() < 0.03 ? 40 : pick([100, 150, 150, 200, 300]),
    thru: rng() < 0.3,
  };
  const n = Number.isFinite(count) ? Math.max(1, Math.min(30, count)) : 1;
  const total = (Number.isFinite(wallW) ? wallW : 100) + 6;
  const eq = (total + (n - 1) * (Number.isFinite(overlap) ? overlap : 0)) / n;
  p.widths = Array.from({ length: n }, (_, i) => {
    if (i === n - 1 && rng() < 0.6) return NaN;
    if (rng() < 0.04) return pick([0, -10, NaN]);
    return r1(eq * (0.8 + rng() * 0.4));
  });
  return p;
}

// Ustawienia „poprawne” (bez błędów walidacji) – żeby porównanie objęło geometrię, ostrzeżenia i podgląd.
function validParams() {
  const join = rng() < 0.3 ? 'butt' : 'overlap';
  const overlap = join === 'butt' ? 1 : pick([0, 2.5, 5, 6, 6, 6]);
  const maxPrint = pick([131, 194, 154, 146, Infinity, Infinity]);
  const wallW = r1(40 + rng() * 900),
    wallH = r1(80 + rng() * 300);
  const mL = pick(MARGINS),
    mR = pick(MARGINS);
  const total = wallW + mL + mR;
  const lim = Number.isFinite(maxPrint) ? maxPrint : 194;
  const need = Math.max(1, Math.ceil((total - overlap) / (lim - overlap) - 1e-9));
  const count = Math.min(30, need + Math.floor(rng() * 3));
  const split = rng() < 0.4 ? 'custom' : 'equal';
  const eq = (total + (count - 1) * overlap) / count;
  const widths = Array.from({ length: count }, (_, i) =>
    i === count - 1 ? NaN : Math.min(lim, r1(eq * (0.9 + rng() * 0.15))),
  );
  return {
    ...base,
    wallW,
    wallH,
    mT: pick(MARGINS),
    mB: pick(MARGINS),
    mL,
    mR,
    join,
    overlap,
    split,
    count,
    widths,
    maxPrint,
    dpi: pick([100, 150, 150, 200, 300]),
    thru: rng() < 0.3,
  };
}

const layout = [...named, ...Array.from({ length: 2500 }, randomParams), ...Array.from({ length: 1500 }, validParams)];

const fit = [];
for (const p of [named[0], named[2], named[3], named[6], named[7], named[8]]) {
  for (const [iw, ih] of [
    [9000, 6000],
    [6000, 4000],
    [1200, 3000],
    [500, 500],
    [24000, 3000],
  ]) {
    for (const zoom of [1, 1.37, 3])
      for (const [fx, fy] of [
        [0.5, 0.5],
        [0, 1],
        [1, 0],
        [0.31, 0.77],
      ])
        fit.push({ p, iw, ih, zoom, fx, fy });
  }
}

const numbers = [
  0, 1, 2, 3, 4, 5, 12, 13, 14, 21, 22, 25, 101, 102, 105, 112, 122, 0.05, 1.25, 1.35, 122.7, 122.75, 1234.567, 1e6,
  -3.14159, 0.004, 2.5, 7245, 16300, 99.95,
];

const MATS = [
  'Mural Canvas CT',
  'Woven Bamboo NW',
  'Diamante CT',
  'Fabric Canvas NW',
  'Canvas NW',
  'Linen NW jednobarwna + druk',
  'Sand Dot GW',
  'Texile Stick GW',
  'Canvas GW',
  'Soft Skin',
  'Luxe Lino (podłoga)',
  'Tapeta Waterproof Out',
  'Nieznany',
  null,
];
const pricing = {
  calc: Array.from({ length: 400 }, () => ({
    material: pick(MATS),
    area: Math.round(rng() * 4000) / 100 + rng() * 0.01,
    joints: Math.floor(rng() * 6),
    heightCm: r1(100 + rng() * 300),
    butt: rng() < 0.4,
    termin: pick(['standard', 'fast', 'express', 'zly']),
    order: rng() < 0.25,
  })),
  area: [named[0], named[2], named[3], named[8], named[13]].flatMap(p =>
    ['margin', 'print', 'wall', 'inne'].map(mode => ({ p, mode })),
  ),
  workdays: [
    ['2026-11-23', 10],
    ['2026-11-23', 7],
    ['2026-11-23', 3],
    ['2026-11-23', 21],
    ['2026-12-20', 10],
    ['2026-12-23', 3],
    ['2025-12-22', 3],
    ['2024-12-23', 3],
    ['2026-04-01', 7],
    ['2027-03-25', 3],
    ['2027-05-25', 10],
    ['2026-10-30', 3],
    ['2026-08-13', 3],
    ['2026-01-01', 1],
    ['2026-06-03', 3],
    ['2028-02-28', 21],
  ],
};

const quality = [
  [0, 1],
  [999.9, 1],
  [1000, 1],
  [1500, 1.5],
  [2499, 1],
  [2500, 1],
  [5905, 2],
  [12000, 3],
  [400, 3],
];

const wall = [];
const itemsSets = [
  [{ type: 'corner', x: 120, w: NaN, y: NaN, h: NaN }],
  [{ type: 'corner', x: 118, w: NaN, y: NaN, h: NaN }],
  [{ type: 'door', x: 100, w: 90, y: 0, h: 200 }],
  [
    { type: 'window', x: 200, w: 120, y: 90, h: 120 },
    { type: 'corner', x: 60, w: NaN, y: NaN, h: NaN },
  ],
  [{ type: 'door', x: NaN, w: 90, y: 0, h: 200 }],
  [{ type: 'door', x: 10, w: NaN, y: 0, h: 200 }],
  [{ type: 'window', x: 300, w: 100, y: 0, h: NaN }],
  [{ type: 'window', x: 100, w: 50, y: 200, h: 100 }],
  [{ type: 'corner', x: 400, w: NaN, y: NaN, h: NaN }],
  [
    { type: 'corner', x: 50, w: NaN, y: NaN, h: NaN },
    { type: 'corner', x: 170, w: NaN, y: NaN, h: NaN },
    { type: 'door', x: 250, w: 80, y: 0, h: 210 },
  ],
  [],
];
for (const items of itemsSets)
  for (const p of [named[0], named[2], named[3], named[8], P({ maxPrint: Infinity }), P({ count: 2, maxPrint: 194 })])
    wall.push({ p, items });

const sample = [];
for (const p of [named[0], named[1], named[2], named[6], P({ wallW: 30, wallH: 50 }), P({ dpi: 300, thru: true })]) {
  for (const vertical of [true, false])
    for (const [fx, fy] of [
      [0.5, 0.5],
      [0, 0],
      [1, 1],
      [0.2, 0.9],
    ])
      sample.push({ p, vertical, fx, fy });
}

const visualization = {
  quads: [
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    [
      { x: 100, y: 50 },
      { x: 700, y: 80 },
      { x: 680, y: 500 },
      { x: 120, y: 520 },
    ],
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ],
    [
      { x: 5, y: 5 },
      { x: 405, y: 5 },
      { x: 405, y: 305 },
      { x: 5, y: 305 },
    ],
  ],
  scales: [
    {
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
        { x: 0.1, y: 0.9 },
      ],
      photoWidth: 1200,
      photoHeight: 900,
      wallW: 350,
      wallH: 270,
      reference: null,
    },
    {
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
        { x: 0.1, y: 0.9 },
      ],
      photoWidth: 1200,
      photoHeight: 900,
      wallW: 350,
      wallH: 270,
      reference: { a: { x: 0.2, y: 0.2 }, b: { x: 0.2, y: 0.8 }, length: 200 },
    },
    {
      points: [
        { x: 0.1, y: 0.15 },
        { x: 0.85, y: 0.1 },
        { x: 0.9, y: 0.95 },
        { x: 0.05, y: 0.9 },
      ],
      photoWidth: 1200,
      photoHeight: 800,
      wallW: 400,
      wallH: 260,
      reference: { a: { x: 0.3, y: 0.3 }, b: { x: 0.6, y: 0.3 }, length: 100 },
    },
    {
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
        { x: 0.1, y: 0.9 },
      ],
      photoWidth: 1200,
      photoHeight: 900,
      wallW: 350,
      wallH: 270,
      reference: { a: { x: 0.2, y: 0.2 }, b: { x: 0.2, y: 0.8 }, length: 1000 },
    },
    {
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
      ],
      photoWidth: 1200,
      photoHeight: 900,
      wallW: 350,
      wallH: 270,
      reference: null,
    },
    {
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
        { x: 0.1, y: 0.9 },
      ],
      photoWidth: 1200,
      photoHeight: 900,
      wallW: 0,
      wallH: 270,
      reference: null,
    },
  ],
  walls: [named[0], named[2], P({ wallW: 800, wallH: 250 }), P({ wallW: 100, wallH: 400 })],
};

const texts = [
  'Fototapeta 350x270 23.11.2026',
  'Zażółć gęślą jaźń ZAŻÓŁĆ GĘŚLĄ JAŹŃ',
  'Kowalski (test) \\ back',
  '2/3  122,7 × 276,0 cm',
  'wymiar ściany',
  'łączenie – styk',
  'emoji 😀 €',
  'a\u0328 e\u0328',
  'Ó ó ×',
  '',
];

const sheet = [
  { p: named[0], panoW: 4000, panoH: 3063 },
  { p: named[1], panoW: 4000, panoH: 3063 },
  { p: P({ wallW: 325, wallH: 245, orderName: 'Fototapeta 325x245 31.10.2026' }), panoW: 4000, panoH: 3000 },
  {
    p: P({ wallW: 325, wallH: 245, join: 'butt', overlap: 1, orderName: 'Fototapeta 325x245 6.11.2026' }),
    panoW: 4000,
    panoH: 3000,
  },
  { p: P({ count: 1, wallW: 120, orderName: 'ŻÓŁĆ (jeden) bryt' }), panoW: 1900, panoH: 4000 },
  {
    p: P({
      wallW: 1000,
      count: 8,
      dpi: 300,
      orderName: 'Bardzo długa nazwa zlecenia klienta Kowalskiego Wiśniewskiego z Gdańska 2026',
    }),
    panoW: 4000,
    panoH: 1100,
  },
  { p: P({ split: 'custom', widths: [100, 120, NaN], mL: 0, mR: 5, mT: 1, mB: 10 }), panoW: 4000, panoH: 3000 },
];

const assembly = [
  {
    form: { wallW: '350', wallH: '270', mT: '3', mB: '3', mL: '3', mR: '3', overlap: '6', count: '3', dpi: '150' },
    material: '131|mural-canvas-ct',
    radios: { join: 'overlap', split: 'equal' },
    order: '',
  },
  {
    form: { wallW: '325', wallH: '245', mT: '3', mB: '3', mL: '3', mR: '3', overlap: '6', count: '3', dpi: '150' },
    material: '',
    radios: { join: 'butt', split: 'equal' },
    order: 'Kowalski – ŻÓŁĆ',
  },
  {
    form: { wallW: '120', wallH: '250', mT: '0', mB: '5', mL: '2.5', mR: '0', overlap: '6', count: '1', dpi: '100' },
    material: '100|sand-dot-gw-107',
    radios: { join: 'overlap', split: 'equal' },
    order: '',
  },
  {
    form: { wallW: '3000', wallH: '300', mT: '3', mB: '3', mL: '3', mR: '3', overlap: '6', count: '26', dpi: '150' },
    material: '',
    radios: { join: 'overlap', split: 'equal' },
    order: 'Hala 26 brytów',
  },
  {
    form: { wallW: '350', wallH: '270', mT: '3', mB: '3', mL: '3', mR: '3', overlap: '0', count: '3', dpi: '150' },
    material: 'own',
    radios: { join: 'overlap', split: 'equal' },
    order: '',
  },
  {
    form: { wallW: '350', wallH: '270', mT: '3', mB: '3', mL: '3', mR: '3', overlap: '6', count: '3', dpi: '150' },
    material: '131|canvas-gw',
    radios: { join: 'overlap', split: 'custom' },
    widths: ['100', '120', ''],
    order: 'Bardzo długa nazwa zlecenia klienta Kowalskiego Wiśniewskiego z Gdańska – salon i jadalnia 2026 r.',
  },
];

const bytes = s => Buffer.from(s, 'latin1').toString('base64');
const zip = [
  { files: [{ name: 'a.txt', b64: bytes('abc') }] },
  {
    files: [
      { name: 'bryt_Fototapeta_1.jpg', b64: bytes('\xff\xd8\xff\xe0JPEGDATA') },
      { name: 'zażółć.pdf', b64: bytes('%PDF-1.4 test') },
      { name: 'pusty.bin', b64: '' },
    ],
  },
];
const jfifHead = '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00';
const jfif = [
  { b64: bytes(jfifHead + 'DANE'), dpi: 150 },
  { b64: bytes(jfifHead + 'DANE'), dpi: 300 },
  { b64: bytes(jfifHead), dpi: 100 },
  { b64: bytes('\xff\xd8\xff\xe1\x00\x10Exif\x00\x00rest-of-file'), dpi: 150 },
  { b64: bytes('krótki'), dpi: 150 },
];

// ---------- część serwerowa ----------
const job = (o, files) => {
  const head = Buffer.from(JSON.stringify(o));
  const len = Buffer.alloc(4);
  len.writeUInt32LE(head.length, 0);
  return Buffer.concat([len, head, ...files]).toString('base64');
};
const okJob = {
  name: 'bryty_x.cdr',
  unit: 'cm',
  link: true,
  pageW: 100,
  pageH: 50,
  ops: [
    { t: 'img', file: 'bryt_1.jpg', x: 0, y: 0, w: 1, h: 1 },
    { t: 'text', s: 'abc' },
  ],
  files: [{ name: 'bryt_1.jpg', size: 3 }],
};
const server = {
  aspects: [1, 0.2, 5, 1.3, NaN, '2', 0, -1, 1 / 3, 3, 356 / 276, 2.999, 0.5, 1.777],
  prompts: [
    { kind: 'generate', p: { prompt: 'las sosnowy', stylePrompt: 'watercolor painting', reference: null } },
    { kind: 'generate', p: { prompt: '', stylePrompt: '', reference: 'data:image/png;base64,AAAA' } },
    { kind: 'generate', p: { prompt: '', stylePrompt: '' } },
    { kind: 'generate', p: { prompt: 'morze', stylePrompt: '', reference: 'data:image/png;base64,AAAA' } },
    { kind: 'edit', p: { prompt: 'jaśniejsze tło' } },
  ],
  images: [
    'data:image/png;base64,iVBORw0KGgo=',
    'data:image/jpeg;base64,/9j/4AAQ',
    'data:image/webp;base64,UklG',
    'data:image/gif;base64,R0lG',
    'https://x.example/a.png',
    'data:image/png;base64,ab cd\n',
    '',
    null,
    5,
    'data:image/png;base64,<script>',
  ],
  targets: [
    { w: 100, h: 100 },
    { w: 0, h: 1 },
    { w: 1e7, h: 1 },
    { w: 1e7 + 1, h: 1 },
    { w: '5', h: 5 },
    null,
    { w: NaN, h: 1 },
    { w: Infinity, h: 1 },
  ],
  texts: [['  abc  '], [5], [null], ['x'.repeat(5000)], ['y'.repeat(400), 300]],
  scenes: [
    { room: 'salon', wallW: 350, wallH: 270 },
    { room: 'biuro', wallW: 401.4, wallH: 260.6 },
    { room: 'nieznany', wallW: 300, wallH: 300 },
    { room: 'pokoj-dzieciecy', wallW: 1000, wallH: 250 },
  ],
  upscales: [
    [1024, 768, { w: 21000, h: 16000 }],
    [2048, 1536, { w: 40000, h: 3000 }],
    [100, 100, { w: 50, h: 50 }],
  ],
  cdrMessages: [
    'Błąd\nAt C:\\x\\zapisz-cdr.ps1:21 char:5\n+ CategoryInfo',
    'Linia 1\nLinia 2\nW C:\\x.ps1:3 znak:7\n+ cos',
    'a\nb\nc\nd\ne\nf\ng\nh',
    '',
    null,
    '\r\nTylko\r\n',
  ],
  paths: [
    '/serwer-fototapety.js',
    '/ai-serwer.js',
    '/ai-powieksz-replicate.js',
    '/logowanie.js',
    '/test-ai-generate.js',
    '/testy/x.js',
    '/node_modules/a',
    '/wyniki/a.cdr',
    '/wzory/pobierz-wzory.js',
    '/.env',
    '/x/.git/config',
    '/bryty.js',
    '/logowanie-strona.js',
    '/wzory/katalog.js',
    '/AI-SERWER.JS',
    '/fonts/a.woff2',
  ],
  cdrJobs: [
    job(okJob, [Buffer.from('abc')]),
    Buffer.from('ab').toString('base64'),
    job(okJob, [Buffer.from('ab')]),
    job({ ...okJob, files: [{ name: '../x.jpg', size: 3 }] }, [Buffer.from('abc')]),
    job({ ...okJob, ops: [{ t: 'img', file: 'inny.jpg' }] }, [Buffer.from('abc')]),
    job({ ...okJob, ops: [{ t: 'zly' }] }, [Buffer.from('abc')]),
    job({ ...okJob, pageW: 0 }, [Buffer.from('abc')]),
    job({ ...okJob, files: [] }, []),
    job(
      {
        ...okJob,
        files: [
          { name: 'a.jpg', size: 1 },
          { name: 'a.jpg', size: 1 },
        ],
        ops: [],
      },
      [Buffer.from('ab')],
    ),
    job({ ...okJob, ops: [{ t: 'text', s: 'x'.repeat(501) }] }, [Buffer.from('abc')]),
    job({ ...okJob, files: [{ name: 'bryt_1.jpg', size: -1 }] }, []),
    Buffer.concat([Buffer.from([5, 0, 0, 0]), Buffer.from('nojso')]).toString('base64'),
  ],
};

export const cases = {
  layout,
  fit,
  numbers,
  pricing,
  quality,
  wall,
  sample,
  visualization,
  texts,
  sheet,
  assembly,
  zip,
  jfif,
  server,
};
