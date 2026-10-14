import type { ClienteApi } from '../api/cliente';

/**
 * Na versão web (só desenvolvimento) não há token de envio: nada é
 * registrado nem apagado na API.
 */
export async function sistemaPermite(): Promise<boolean> {
  return true;
}

export async function registrarAparelho(_cliente: ClienteApi): Promise<boolean> {
  return false;
}

export async function esquecerAparelho(_cliente: ClienteApi): Promise<void> {}
