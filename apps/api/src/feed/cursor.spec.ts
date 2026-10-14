import { randomUUID } from 'node:crypto';
import { codificarCursor, CursorInvalido, decodificarCursor } from './cursor';

describe('cursor do feed', () => {
  it('ida e volta preservando microssegundos', () => {
    const cursor = {
      ocorridoEm: '2026-10-14 12:00:00.123456+00',
      id: randomUUID(),
    };
    const texto = codificarCursor(cursor);
    expect(texto).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodificarCursor(texto)).toEqual(cursor);
  });

  it.each([
    ['lixo', 'nao-e-cursor'],
    ['json sem tupla', Buffer.from('{"a":1}').toString('base64url')],
    [
      'data inválida',
      Buffer.from(JSON.stringify(['ontem de manhã', randomUUID()])).toString(
        'base64url',
      ),
    ],
    [
      'id que não é uuid',
      Buffer.from(
        JSON.stringify(['2026-10-14 12:00:00+00', '1; DROP']),
      ).toString('base64url'),
    ],
  ])('recusa %s', (_caso, texto) => {
    expect(() => decodificarCursor(texto)).toThrow(CursorInvalido);
  });
});
