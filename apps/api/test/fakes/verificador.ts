import { Provedor } from '../../src/auth/usuarios.repositorio';
import {
  IdentidadeInvalida,
  VerificadorIdentidade,
} from '../../src/auth/verificador-identidade';

/** Aceita tokens no formato "valido-token-teste:<sujeito>"; recusa o resto. */
export class VerificadorFalso extends VerificadorIdentidade {
  verificar(_provedor: Provedor, token: string): Promise<string> {
    const [prefixo, sujeito] = token.split(':');
    if (prefixo !== 'valido-token-teste' || !sujeito) {
      return Promise.reject(new IdentidadeInvalida('token falso'));
    }
    return Promise.resolve(sujeito);
  }
}
