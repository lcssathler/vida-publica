import * as Apple from 'expo-apple-authentication';
import { Platform } from 'react-native';
import type { ClienteApi } from '../api/cliente';
import type { ParDeTokens } from '../api/tipos';

export type Provedor = 'apple' | 'google';

export interface ResultadoLogin extends ParDeTokens {
  /** A conta anônima do aparelho foi juntada a uma conta que já existia. */
  contaExistente: boolean;
}

/** O login foi cancelado pela pessoa: não é erro. */
export class LoginCancelado extends Error {}

const GOOGLE_WEB = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const GOOGLE_IOS = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

/** Apple só no iOS, quando o aparelho oferece. */
export async function appleDisponivel(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return Apple.isAvailableAsync();
}

/** Google só no app nativo, quando os client IDs foram configurados no build. */
export function googleDisponivel(): boolean {
  if (Platform.OS === 'web' || !GOOGLE_WEB) return false;
  return Platform.OS !== 'ios' || Boolean(GOOGLE_IOS);
}

async function tokenApple(): Promise<string> {
  try {
    // Sem nome nem e-mail: a API guarda só o identificador opaco.
    const credencial = await Apple.signInAsync({ requestedScopes: [] });
    if (!credencial.identityToken) throw new Error('A Apple não devolveu o token de identidade.');
    return credencial.identityToken;
  } catch (erro) {
    if ((erro as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new LoginCancelado();
    throw erro;
  }
}

async function tokenGoogle(): Promise<string> {
  // Carregado só aqui: o módulo nativo não existe no Expo Go nem na web.
  const { GoogleSignin, isSuccessResponse } = await import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId: GOOGLE_WEB, iosClientId: GOOGLE_IOS || undefined });
  await GoogleSignin.hasPlayServices();
  const resposta = await GoogleSignin.signIn();
  if (!isSuccessResponse(resposta)) throw new LoginCancelado();
  if (!resposta.data.idToken) throw new Error('O Google não devolveu o token de identidade.');
  return resposta.data.idToken;
}

/**
 * Login opcional: pega o token de identidade do provedor no aparelho e troca
 * na API (POST /auth/entrar/{provedor}). A sessão passa a ser a do par novo.
 */
export async function entrar(cliente: ClienteApi, provedor: Provedor): Promise<ResultadoLogin> {
  const token = provedor === 'apple' ? await tokenApple() : await tokenGoogle();
  const resultado = await cliente.post<ResultadoLogin>(`/auth/entrar/${provedor}`, { token });
  await cliente.adotar(resultado);
  return resultado;
}
