/** Razão de contraste WCAG 2.x entre duas cores em hexadecimal (#RRGGBB). */
export function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string): number => {
    const value = hex.replace('#', '');
    const channels = [0, 2, 4].map((offset) => {
      const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}
