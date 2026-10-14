import { SetMetadata } from '@nestjs/common';

export interface Politica {
  max: number;
  janelaMs: number;
  /** Conta por usuário autenticado ou por IP (rotas públicas). */
  por: 'usuario' | 'ip';
}

export type NomePolitica = 'usuario' | 'ip' | 'contas' | 'busca';

/** Limites em vigor, montados da configuração. */
export class Limites {
  constructor(readonly politicas: Record<NomePolitica, Politica>) {}
}

export const LIMITE = 'vp:limite';

/**
 * Política específica da rota. Sem ela: `usuario` nas rotas autenticadas e
 * `ip` nas públicas. `null` desliga o limite (saúde).
 */
export const Limite = (politica: NomePolitica | null) =>
  SetMetadata(LIMITE, politica);
