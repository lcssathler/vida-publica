import type { Cofre } from '../api/cliente';

const CHAVE = 'vp.refresh';

/**
 * Na versão web (só para desenvolvimento) não há armazenamento seguro: o
 * refresh fica no sessionStorage da aba e some quando ela fecha. O app nas
 * lojas usa o cofre.ts (Keychain/Keystore).
 */
function armazenamento(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export const cofre: Cofre = {
  ler: async () => armazenamento()?.getItem(CHAVE) ?? null,
  gravar: async (refresh) => armazenamento()?.setItem(CHAVE, refresh),
  apagar: async () => armazenamento()?.removeItem(CHAVE),
};
