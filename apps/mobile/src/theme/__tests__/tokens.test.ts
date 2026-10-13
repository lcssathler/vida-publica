import { contrastRatio } from '../contrast';
import { palettes, type ColorScheme } from '../tokens';

const schemes: ColorScheme[] = ['light', 'dark'];

describe.each(schemes)('paleta %s', (scheme) => {
  const p = palettes[scheme];

  it('texto principal e secundário atingem WCAG AA (4,5:1) sobre o papel', () => {
    expect(contrastRatio(p.ink, p.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.ink2, p.paper)).toBeGreaterThanOrEqual(4.5);
  });

  it('metadado (ink3) atinge ao menos 3:1, usado só em texto grande ou não essencial', () => {
    expect(contrastRatio(p.ink3, p.paper)).toBeGreaterThanOrEqual(3);
  });

  it('carimbo e aviso de dado incompleto são legíveis', () => {
    expect(contrastRatio(p.stamp, p.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.caution, p.cautionBackground)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contrastRatio', () => {
  it('preto sobre branco é 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });
});
