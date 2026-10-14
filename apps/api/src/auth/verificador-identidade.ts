import { Provedor } from './usuarios.repositorio';

export class IdentidadeInvalida extends Error {}

export class ProvedorDesligado extends Error {}

/** Porta: confere o token de identidade emitido pela Apple ou pelo Google. */
export abstract class VerificadorIdentidade {
  /** Devolve o identificador estável do usuário no provedor (claim "sub"). */
  abstract verificar(provedor: Provedor, token: string): Promise<string>;
}
