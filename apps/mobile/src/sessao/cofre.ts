import * as SecureStore from 'expo-secure-store';
import type { Cofre } from '../api/cliente';

const CHAVE = 'vp.refresh';

/**
 * Refresh token no armazenamento seguro do aparelho (Keychain no iOS,
 * Keystore no Android), fora do backup. Legível depois do primeiro desbloqueio,
 * para a renovação em segundo plano das notificações (Fase 7).
 */
const opcoes: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

export const cofre: Cofre = {
  ler: () => SecureStore.getItemAsync(CHAVE, opcoes),
  gravar: (refresh) => SecureStore.setItemAsync(CHAVE, refresh, opcoes),
  apagar: () => SecureStore.deleteItemAsync(CHAVE, opcoes),
};
