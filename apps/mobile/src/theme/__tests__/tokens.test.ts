import { contrastRatio } from '../contrast';
import { palettes, type ColorScheme } from '../tokens';

const schemes: ColorScheme[] = ['light', 'dark'];

describe.each(schemes)('paleta %s', (scheme) => {
  const p = palettes[scheme];

  it('todo texto (inclusive metadado em 12 pt) atinge WCAG AA (4,5:1) no fundo e no cartão', () => {
    for (const fundo of [p.background, p.surface]) {
      expect(contrastRatio(p.ink, fundo)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.ink2, fundo)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.ink3, fundo)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.accent, fundo)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.error, fundo)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('pares compostos: botão primário, etiqueta, registro novo, aviso e barra', () => {
    expect(contrastRatio(p.background, p.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.accent, p.accentWash)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.ink, p.highlight)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.caution, p.cautionBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.barActiveIcon, p.barActive)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.barIcon, p.bar)).toBeGreaterThanOrEqual(3);
  });

  it('opção inativa em título grande e contornos passam 3:1 (WCAG 1.4.3 e 1.4.11)', () => {
    expect(contrastRatio(p.inactive, p.background)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(p.ink2, p.background)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(p.accent, p.background)).toBeGreaterThanOrEqual(3);
  });
});

describe('contrastRatio', () => {
  it('preto sobre branco é 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });
});
