import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * CORS só para as origens listadas (o app nativo não precisa: só a versão web
 * do Expo, usada no desenvolvimento). Lista vazia desliga o CORS.
 * Retry-After e RateLimit-* ficam expostos para o app tratar o 429.
 */
export function opcoesCors(origens: string[]): CorsOptions | null {
  if (origens.length === 0) return null;
  return {
    origin: origens,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: [
      'Retry-After',
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
    ],
    maxAge: 600,
  };
}
