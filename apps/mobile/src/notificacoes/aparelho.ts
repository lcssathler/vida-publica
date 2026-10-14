import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { ClienteApi } from '../api/cliente';
import { tokenDeEnvio } from './token';

/** O sistema permite avisos para o app (no iOS, também o modo provisório). */
export async function sistemaPermite(): Promise<boolean> {
  const permissao = await Notifications.getPermissionsAsync();
  return (
    permissao.granted ||
    permissao.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

/**
 * Registra na API o token de envio do FCM desta sessão (só o token e a
 * plataforma). Só depois que a pessoa aceitou a pré-pergunta e o sistema
 * permitiu: sem permissão, nada é pedido nem enviado. Devolve se registrou.
 */
export async function registrarAparelho(
  cliente: ClienteApi,
  obterToken: () => Promise<string | null> = tokenDeEnvio,
): Promise<boolean> {
  if (!(await sistemaPermite())) return false;
  const token = await obterToken();
  if (!token) return false;
  await cliente.put('/dispositivo', { token, plataforma: Platform.OS === 'ios' ? 'ios' : 'android' });
  return true;
}

/** Apaga o token desta sessão na API: o aparelho para de receber avisos. */
export async function esquecerAparelho(cliente: ClienteApi): Promise<void> {
  await cliente.delete('/dispositivo');
}
