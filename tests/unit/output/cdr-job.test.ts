import { describe, expect, it } from 'vitest';
import { computeLayout } from '../../../src/domain/layout';
import {
  CDR_MAX_FILES,
  cdrJob,
  cdrRequestParts,
  parseCdrJob,
  CdrJobError,
  type CdrJob,
} from '../../../src/output/cdr-job';
import { ProductionSheet } from '../../../src/output/sheet';
import { concat, enc } from '../../support/bytes';
import { fromBase64, golden } from '../../support/golden';
import { P005 } from '../../support/params';

const request = (job: object, files: Uint8Array[]): Uint8Array => {
  const head = enc(JSON.stringify(job));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, head.length, true);
  return concat([len, head, ...files]);
};
const okJob = {
  name: 'a.cdr',
  pageW: 10,
  pageH: 10,
  ops: [{ t: 'img', file: 'bryt_1.jpg' }],
  files: [{ name: 'bryt_1.jpg', size: 3 }],
};
const err = (body: Uint8Array): string => {
  try {
    parseCdrJob(body);
    return 'brak błędu';
  } catch (e) {
    expect(e).toBeInstanceOf(CdrJobError);
    expect((e as CdrJobError).status).toBe(400);
    return (e as Error).message;
  }
};

describe('zlecenie dla CorelDRAW (przeglądarka → serwer)', () => {
  it('005-21: arkusz z rysunku, pliki: podgląd + 3 bryty, nazwa bryty_<zlecenie>.cdr', () => {
    const L = computeLayout(P005);
    const job = cdrJob(new ProductionSheet(L, P005), { ...P005, order: 'Kowalski' }, [10, 20, 20, 20]);
    expect(job.name).toBe('bryty_Kowalski.cdr');
    expect(job.files.map(f => f.name)).toEqual(['pano.jpg', 'bryt_1.jpg', 'bryt_2.jpg', 'bryt_3.jpg']);
    expect(job.ops.length).toBeGreaterThan(20);
  });
  it('świadoma zmiana (Sebastian 23.11.2026): obrazy domyślnie osadzone, linkowane tylko na życzenie', () => {
    const L = computeLayout(P005);
    const sheet = new ProductionSheet(L, P005);
    const embedded = cdrJob(sheet, P005, [10, 20, 20, 20]);
    const linked = cdrJob(sheet, P005, [10, 20, 20, 20], true);
    expect(embedded.link).toBe(false);
    expect(linked.link).toBe(true);
    // Poza tym jednym polem zlecenie jest takie samo jak w starym programie.
    expect({ ...linked, link: false }).toEqual(embedded);
  });
  it('treść żądania: długość opisu (4 bajty LE), opis JSON, dane plików po kolei – i serwer to odczytuje', () => {
    const job = { ...okJob, unit: 'cm', link: true } as unknown as CdrJob;
    const files = [enc('abc')];
    const body = concat(cdrRequestParts(job, files));
    const parsed = parseCdrJob(body);
    expect(parsed.dataStart).toBe(body.length - 3);
    expect(parsed.name).toBe('a.cdr');
  });
  it('odrzuca niekompletne i podejrzane dane (status 400)', () => {
    expect(err(new Uint8Array(2))).toBe('Niekompletne dane z przeglądarki.');
    expect(err(request({ ...okJob, files: [{ name: '../x.jpg', size: 3 }] }, [enc('abc')]))).toBe(
      'Niepoprawna nazwa pliku.',
    );
    expect(err(request({ ...okJob, ops: [{ t: 'img', file: 'C:/x.jpg' }] }, [enc('abc')]))).toBe(
      'Obraz spoza przesłanych plików.',
    );
    expect(err(request(okJob, [enc('abcd')]))).toBe('Niekompletne dane z przeglądarki.');
    expect(err(request({ ...okJob, ops: Array(10001).fill({ t: 'line' }) }, [enc('abc')]))).toBe(
      'Za dużo elementów arkusza.',
    );
    const many = Array.from({ length: CDR_MAX_FILES + 1 }, (_, i) => ({ name: `b${i}.jpg`, size: 0 }));
    expect(err(request({ ...okJob, files: many }, []))).toBe('Niepoprawna liczba plików.');
  });
});

describe('zgodność ze starym serwerem', () => {
  it('12 nagranych zleceń: wynik albo ten sam komunikat błędu', () => {
    const cases = golden<{ parseCdrJob: { b64: string; ok?: object; err?: string }[] }>('server-ai').parseCdrJob;
    expect(cases).toHaveLength(12);
    for (const c of cases) {
      const body = fromBase64(c.b64);
      if (c.ok) expect(parseCdrJob(body)).toEqual(c.ok);
      else expect(err(body)).toBe(c.err);
    }
  });
});
