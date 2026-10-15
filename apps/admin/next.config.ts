import { join } from 'node:path';
import type { NextConfig } from 'next';

/**
 * Cabeçalhos de segurança de todas as páginas. O painel não carrega nada de
 * fora (nem fontes, nem scripts de terceiros) e não pode ser embutido.
 */
const seguranca = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // O Next injeta scripts inline de hidratação; eval só no desenvolvimento
      // (recarga rápida do webpack).
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "object-src 'none'",
    ].join('; '),
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // same-origin: o navegador manda a origem nos formulários do próprio painel
  // (o Next confere contra CSRF) e nada para fora (links das fontes oficiais).
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Cache-Control', value: 'no-store' },
];

const config: NextConfig = {
  // Imagem enxuta (apps/admin/Dockerfile); a raiz do monorepo entra no
  // rastreio porque o pnpm guarda as dependências lá.
  output: 'standalone',
  outputFileTracingRoot: join(import.meta.dirname, '../..'),
  poweredByHeader: false,
  reactStrictMode: true,
  // Sem telemetria nem otimização de imagens (o painel não tem imagens).
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/:path*', headers: seguranca }];
  },
};

export default config;
