// Teksty poleceń dla OpenAI (grafika AI i wizualizacja we wnętrzu) oraz walidacja danych od przeglądarki.
// Przeniesione 1:1 ze starych ai-serwer.js i ai-wnetrze.js (treść poleceń z konfiguratora FeltDecor).
// Reguły „druku” (brak ramek, ważne elementy z dala od krawędzi) to założenia – DO WALIDACJI z graficzką.

/** Dłuższy bok propozycji; powyżej 2560×1440 OpenAI opisuje jako eksperymentalne. */
export const LONG_SIDE = 2048;
/** Maks. liczba znaków opisu / poprawki od klienta. */
export const MAX_PROMPT = 4000;

export type PromptKind = 'generate' | 'edit';

export interface PromptParams {
  prompt: string;
  stylePrompt?: string;
  reference?: unknown;
}

export interface ScenePromptParams {
  room?: unknown;
  wallW: number;
  wallH: number;
}

export interface RoomInfo {
  label: string;
  notes: string[];
}

/** Rozmiar zgodny z wymaganiami API: boki podzielne przez 16, proporcja od 1:3 do 3:1. */
export function size(aspect: unknown): string {
  const a = Math.min(3, Math.max(1 / 3, Number(aspect) || 1));
  const r16 = (x: number): number => Math.max(16, Math.round(x / 16) * 16);
  return a >= 1 ? `${LONG_SIDE}x${r16(LONG_SIDE / a)}` : `${r16(LONG_SIDE * a)}x${LONG_SIDE}`;
}

/** Obraz od przeglądarki: tylko data URL PNG/JPEG/WEBP (nie dowolny adres przekazywany dalej do OpenAI). */
export const isImage = (v: unknown): v is string =>
  typeof v === 'string' && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(v);

/** Tekst od klienta: przycięty i ograniczony długością. */
export const text = (v: unknown, max = MAX_PROMPT): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Wymiar druku dla powiększania: dodatnie, skończone liczby (górny limit przycinają same usługi). */
export const validTarget = (t: unknown): t is { w: number; h: number } =>
  !!t &&
  typeof t === 'object' &&
  [(t as { w?: unknown }).w, (t as { h?: unknown }).h].every(
    v => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1e7,
  );

// Prompt w stylu promptów wizualizacji FeltDecor: bloki, twarde reguły, priorytety, końcowa kontrola.
const PRINT_RULES: string = [
  'PRINT RULES (always apply)',
  '- The image is a large-format wall mural (photo wallpaper), printed edge to edge and cut into vertical strips.',
  '- Fill the whole canvas. No frames, borders, vignettes, drop shadows, mockup walls or rooms around the artwork.',
  '- No text, letters, numbers, logos, signatures or watermarks.',
  '- Keep faces and key details away from the outer 5% of each edge – the edges are trimmed during installation.',
  '- Even, natural lighting and clean, sharp detail. Avoid AI artifacts: warped lines, melted shapes, extra limbs, noise, blur.',
].join('\n');

export function prompt(kind: PromptKind, p: PromptParams): string {
  if (kind === 'edit')
    return [
      'IMAGE 1 — SOURCE OF TRUTH',
      'IMAGE 1 is the approved mural design. Preserve its composition, subject, colours, style and proportions.',
      '',
      'REQUESTED CHANGE (apply only this, nothing else):',
      p.prompt,
      '',
      'Do not add new objects, do not restyle the image, do not crop or reframe it unless the change asks for it.',
      '',
      PRINT_RULES,
      '',
      'FINAL CHECK: the result must look like IMAGE 1 with only the requested change applied.',
    ].join('\n');
  return [
    'TASK: Create an original wall mural design.',
    '',
    'SUBJECT',
    p.prompt ||
      (p.reference
        ? 'The same kind of subject and motifs as IMAGE 1, in a new arrangement.'
        : 'A calm, decorative wall mural.'),
    p.stylePrompt ? '\nSTYLE\n' + p.stylePrompt : null,
    p.reference
      ? [
          '',
          'STYLE REFERENCE (IMAGE 1)',
          'Match IMAGE 1 closely in: artistic technique and medium, colour palette and tones, textures and surface (paper, plaster, cracks, grain),',
          'level of detail, lighting, mood and type of subject. The result should feel like it belongs to the same collection.',
          'Create a NEW composition: a different arrangement, placement and shape of the motifs, drawn fresh.',
          'Do not reproduce, trace or retouch IMAGE 1 and do not copy any specific recognizable element from it.',
        ].join('\n')
      : null,
    '',
    PRINT_RULES,
    '',
    p.reference
      ? 'PRIORITIES: 1) new composition (not a copy), 2) same style, palette and texture as IMAGE 1, 3) print rules, 4) subject.'
      : 'PRIORITIES: 1) original design, 2) print rules, 3) subject and style.',
    'FINAL CHECK: no text or watermark, no frame, canvas fully filled, nothing important at the edges' +
      (p.reference ? ', same style as IMAGE 1 but a new composition.' : '.'),
  ]
    .filter(x => x !== null)
    .join('\n');
}

// --- Wizualizacja we wnętrzu (sekcja 10) ---

export const INTERIOR_ROOMS: Readonly<Record<string, RoomInfo>> = {
  salon: {
    label: 'living room',
    notes: [
      'Function: a contemporary living room for sitting, talking and everyday leisure.',
      'Space: a believable lounge composition with depth, not a wall with two isolated seats.',
      'Typical elements: seating, a low table, lighting and supporting living-room pieces used as a designed whole.',
      'Architecture and light: refined residential architecture with natural photographic daylight and warm accent light.',
    ],
  },
  sypialnia: {
    label: 'bedroom',
    notes: [
      'Function: a real bedroom for rest and sleep.',
      'Space: a calm sleeping zone with a bed as the natural centre of the room.',
      'Typical elements: a bed, bedside setting, soft textiles and restrained bedroom lighting.',
      'Architecture and light: quieter residential architecture, softer light, quieter materials.',
    ],
  },
  jadalnia: {
    label: 'dining room',
    notes: [
      'Function: a real dining room for shared meals.',
      'Space: a dining zone with a table as the natural centre, with residential scale and depth.',
      'Typical elements: a dining table, chairs, a pendant light and a few supporting pieces.',
      'Architecture and light: refined residential architecture, natural daylight and warm light over the table.',
    ],
  },
  'gabinet-domowy': {
    label: 'home study',
    notes: [
      'Function: an elegant home study in a house or apartment, not a corporate office.',
      'Space: a private place to think and work, with residential scale and depth.',
      'Typical elements: a desk, a good chair, lighting and a few quiet supporting pieces.',
      'Architecture and light: premium residential architecture, calm daylight, focused task light.',
    ],
  },
  'pokoj-dzieciecy': {
    label: "children's room",
    notes: [
      "Function: a contemporary, well-designed child's room — clearly a child's space, not a teenager's room and not a nursery.",
      'Space: child-scale zones for sleep, play and/or learning, organised as a real designed room.',
      "Typical elements: a child's bed, a small place to play or study, softer colours and a friendly character.",
      'Architecture and light: premium residential architecture, catalog photography, daylight, creative but restrained colour.',
      "Do not create an infantile fairy-tale set, a surplus of toys, a baby nursery, or a teenager's room.",
    ],
  },
  'pokoj-nastolatka': {
    label: "teenager's room",
    notes: [
      "Function: a contemporary teenager's room — clearly more mature than a child's room.",
      'Space: a natural mix of sleep, study and rest, with teenage scale and independence.',
      'Typical elements: a bed, a desk or study place, and modern furnishings used as a designed whole.',
      "Do not create a small child's room, infantile toys, fairy-tale styling, an adult study, or an ordinary adult bedroom.",
    ],
  },
  biuro: {
    label: 'professional office',
    notes: [
      'Function: a professional workplace.',
      'Space: a real office or work zone with contemporary commercial architecture.',
      'Typical elements: desks or a work setting, task lighting and office-scale furnishings.',
      'Architecture and light: premium workplace architecture, clear even light, precise materials.',
      'Do not turn this into a living room with a desk added.',
    ],
  },
  'sala-konferencyjna': {
    label: 'conference room',
    notes: [
      'Function: a professional meeting room.',
      'Space: a real conference setting organised around discussion and presentation.',
      'Typical elements: a conference table, chairs and lighting designed for meetings.',
      'Architecture and light: finished commercial interior, controlled architectural light, a quiet meeting atmosphere.',
    ],
  },
  recepcja: {
    label: 'reception',
    notes: [
      'Function: a reception and arrival space of a company, hotel or high-end service building.',
      'Space: a real entrance and greeting zone, with depth and a clear path to the desk.',
      'Typical elements: a reception desk, arrival space and lighting for welcome and orientation.',
      'Architecture and light: public-interior architecture, generous volume, clear daylight or lobby light.',
      'Do not fake a reception with a sideboard in a living room.',
    ],
  },
};

const muralProtection = (img: string): string =>
  [
    `${img} — MURAL ARTWORK — SOURCE OF TRUTH`,
    '',
    `${img} is the exact finished photo wallpaper (printed wall mural) for this wall. It is the only source of truth for the mural.`,
    `Preserve exactly as shown in ${img}: the composition, every motif and its position, colours, contrast, proportions and all details from edge to edge.`,
    'Do not: crop, zoom into a fragment, extend, repeat, tile, mirror, rotate, stretch or compress the artwork; repaint, restyle, simplify or "improve" it; add or remove motifs; add text, logos or watermarks.',
    'The mural is printed on matte wallpaper and glued flat onto the wall. Joints between wallpaper strips are invisible or barely visible.',
    'It is NOT a framed picture, poster, canvas, screen, window view or a panel standing in front of the wall.',
    'The mural is FIXED. The surrounding interior must adapt to the mural. The mural must not adapt to the interior.',
  ].join('\n');

const oneWallPlane: string = [
  'MURAL INSTALLATION PLANE',
  '',
  'The mural belongs to exactly ONE architectural wall plane. Apply it to ONE wall only.',
  'Do NOT copy, continue, wrap, repeat or extend the mural onto any adjacent wall, ceiling, floor or furniture.',
  'A room corner is a hard boundary for the mural. Other visible walls remain normal painted walls.',
].join('\n');

const fullCoverage = (img: string): string =>
  [
    'FULL WALL COVERAGE — NO BARE WALL STRIPS',
    '',
    `The WHOLE ${img} is visible on the wall, edge to edge: its bottom edge sits directly on the floor line, its top edge directly at the ceiling line, its left and right edges in the room corners or wall ends.`,
    'Do NOT add a skirting board, baseboard, plinth, dado, white or painted strip, border or margin between the mural and the floor, ceiling or corners.',
    'No plain wall is visible on this wall: not at the bottom, not at the top, not at the sides.',
    `Do not crop ${img} to make room for such a strip; do not shrink it to leave a margin.`,
  ].join('\n');

const photoStandard: string = [
  'PHOTOGRAPHIC AND ARCHITECTURAL STANDARD',
  '',
  'Render the scene as high-end interior editorial photography and premium architectural photography.',
  'Use realistic materials, believable architecture, natural proportions and professionally designed interior styling.',
  'Lighting must be natural photographic lighting, with realistic shadows, depth and perspective.',
  'Furniture must have believable dimensions and sit naturally in the room.',
  'Avoid the look of a cheap 3D render, CGI, artificial showroom, surreal architecture, floating furniture or impossible proportions.',
  'Do not treat the mural as a picture, poster or television hung above a sideboard.',
  'Avoid decorative mirrors and large mirror-like reflective surfaces. No people.',
].join('\n');

function ratio(w: number, h: number): string {
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const W = Math.round(w),
    H = Math.round(h),
    d = g(W, H) || 1;
  return `${W / d}:${H / d} (width ÷ height = ${(w / h).toFixed(3)})`;
}

export function scenePrompt(p: ScenePromptParams): string {
  const room =
    (typeof p.room === 'string' && Object.hasOwn(INTERIOR_ROOMS, p.room) ? INTERIOR_ROOMS[p.room] : undefined) ??
    INTERIOR_ROOMS.salon!;
  const W = Math.round(p.wallW),
    H = Math.round(p.wallH);
  return [
    'TASK',
    '',
    `Create a photorealistic premium ${room.label} around the supplied exact wall mural.`,
    'DO NOT FIT THE MURAL TO THE ROOM. FIT THE ROOM TO THE MURAL.',
    '',
    'IMAGE 1 is the exact finished mural. The complete rectangular IMAGE 1 represents the COMPLETE architectural wall.',
    `The physical wall measures ${W} cm wide × ${H} cm high. Required wall proportion: ${ratio(p.wallW, p.wallH)}.`,
    'The mural covers 100% of this ONE wall plane: from the left to the right architectural boundary and from floor to ceiling.',
    '100% means the entire defined wall, not every wall visible in the room.',
    '',
    fullCoverage('IMAGE 1'),
    '',
    oneWallPlane,
    '',
    muralProtection('IMAGE 1'),
    '',
    'ROOM GEOMETRY REFERENCE — SPATIAL SCALE ONLY',
    '',
    'IMAGE 2 is a simple drawing of the room: the grey main wall with the adjacent side walls, floor and ceiling.',
    'Use it only to understand the proportions of the main wall, its scale, the camera position and perspective.',
    'The grey main wall in IMAGE 2 corresponds to the full mural from IMAGE 1.',
    'Do NOT copy colours, textures or graphic elements from IMAGE 2. IMAGE 2 is not a product image.',
    'Do not enlarge the mural merely to fill the composition.',
    '',
    'You may design the side walls, ceiling, floor, furniture, lighting and decorations to suit the mural.',
    'The mural must not appear as a decorative panel, picture, screen or a smaller surface on a larger wall.',
    'Keep the mural clearly visible. Furniture may stand in front of the lower part of the wall but must not hide an important part of it.',
    '',
    'INTERIOR ARRANGEMENT (applies ONLY to the surrounding interior, never to the mural)',
    '',
    photoStandard,
    '',
    `ROOM TYPE: ${room.label}`,
    ...room.notes,
    '',
    'PRIORITY:',
    '1. exact mural from IMAGE 1',
    '2. wall proportion from the dimensions above',
    '3. 100% coverage of one wall',
    '4. colours and details of the mural',
    '5. correct architectural wall interpretation',
    '6. photorealistic interior',
    '',
    'FINAL RULE: The mural is fixed. The room must adapt to the mural.',
  ].join('\n');
}

export function photoPrompt(): string {
  return [
    'You are generating a photorealistic visualization of a photo wallpaper (wall mural) installed in a real room.',
    '',
    'IMAGE 1 is the clean original client interior photograph. Use it as the base image. Keep this room.',
    'Preserve its architecture, perspective, walls, floor, ceiling, windows, doors, furniture and other elements as faithfully as possible.',
    'Do not redesign the room. Return a result with the SAME framing as IMAGE 1: same camera, same crop, same composition. Only the marked quadrilateral may change.',
    '',
    muralProtection('IMAGE 2'),
    '',
    'IMAGE 3 is a copy of IMAGE 1 with the target wall area marked: BRIGHT GREEN quadrilateral = the only area you may change.',
    'The darkened area must remain identical to IMAGE 1. The numbered corners are the corners of IMAGE 2 in order: 1 top-left, 2 top-right, 3 bottom-right, 4 bottom-left.',
    'The edit mask supplied with the request marks the same quadrilateral.',
    '',
    'HARD BOUNDARY: the mural may appear ONLY inside that quadrilateral. Do not change any pixel outside it. Do not let the mural leak onto a neighbouring wall.',
    '',
    'Map the WHOLE IMAGE 2 onto the quadrilateral as a perspective (homography): corner 1 → point 1, 2 → 2, 3 → 3, 4 → 4.',
    'Fill the quadrilateral from edge to edge, no margin inside it, no frame.',
    'The whole IMAGE 2 must be visible: its bottom edge on the bottom edge of the quadrilateral. No skirting board, white strip or bare wall band inside the quadrilateral.',
    '',
    'Objects that stand in front of the marked wall in IMAGE 1 (furniture, lamps, plants) stay in front of the mural.',
    "Match lighting, shadows and colour temperature to the client's interior. The mural must look physically installed on the existing wall, not pasted onto the photograph.",
    '',
    'If IMAGE 1 and IMAGE 2 conflict, IMAGE 2 wins for the mural appearance. IMAGE 1 wins for the room, camera and every pixel outside the quadrilateral. IMAGE 3 and the mask win for the exact area.',
  ].join('\n');
}
