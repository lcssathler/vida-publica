import { contrastRatio } from '../contrast';
import { palettes, type ColorScheme } from '../tokens';

const schemes: ColorScheme[] = ['light', 'dark'];

describe.each(schemes)('paleta %s', (scheme) => {
  const p = palettes[scheme];

  it('todo texto (inclusive metadado em 11 pt) atinge WCAG AA (4,5:1) no papel e no papel elevado', () => {
    for (const fundo of [p.paper, p.paperRaised]) {
      expect(contrastRatio(p.ink, fundo)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.ink2, fundo)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.ink3, fundo)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.stamp, fundo)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.error, fundo)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('pares compostos: botão primário, item marcado, registro novo e aviso', () => {
    expect(contrastRatio(p.paper, p.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.stamp, p.stampWash)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.ink, p.highlight)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.caution, p.cautionBackground)).toBeGreaterThanOrEqual(4.5);
  });

  it('contornos de controle (ink2) e do item marcado (stamp) passam 3:1 (WCAG 1.4.11)', () => {
    expect(contrastRatio(p.ink2, p.paper)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(p.stamp, p.paper)).toBeGreaterThanOrEqual(3);
  });
});

describe('contrastRatio', () => {
  it('preto sobre branco é 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });
});
