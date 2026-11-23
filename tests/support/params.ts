import type { WallParams } from '../../src/domain/layout';

/** Wzorzec drukarni (zlecenie 005-21): ściana 350×270, naddatek 3 cm, zakład 6 cm, 3 bryty, 150 DPI. */
export const P005: WallParams = {
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
  widths: [],
  maxPrint: 131,
  dpi: 150,
  thru: false,
  pdf: true,
  order: 'Fototapeta',
  orderName: 'Fototapeta',
};
