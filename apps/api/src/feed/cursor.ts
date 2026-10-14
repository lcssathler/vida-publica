import { z } from 'zod';
import { Cursor } from './evento';

const cursorSchema = z.tuple([z.string().min(10).max(40), z.uuid()]);

export class CursorInvalido extends Error {}

/** Cursor opaco para o app: base64url de [ocorrido_em, id]. */
export function codificarCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.ocorridoEm, cursor.id])).toString(
    'base64url',
  );
}

export function decodificarCursor(texto: string): Cursor {
  try {
    const bruto: unknown = JSON.parse(
      Buffer.from(texto, 'base64url').toString('utf8'),
    );
    const [ocorridoEm, id] = cursorSchema.parse(bruto);
    if (Number.isNaN(Date.parse(ocorridoEm))) throw new CursorInvalido();
    return { ocorridoEm, id };
  } catch {
    throw new CursorInvalido();
  }
}
