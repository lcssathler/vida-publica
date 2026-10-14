import { onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Liga o estado de conexão do aparelho às consultas: sem rede, elas ficam em
 * pausa e a tela mostra o que está guardado; ao voltar, retomam sozinhas.
 * Na web, o TanStack Query já ouve os eventos online/offline do navegador.
 */
export function ligarConexao(): void {
  if (Platform.OS === 'web') return;
  onlineManager.setEventListener((definir) => {
    const assinatura = Network.addNetworkStateListener((estado) =>
      definir(estado.isConnected !== false && estado.isInternetReachable !== false),
    );
    return () => assinatura.remove();
  });
}

export function useConectado(): boolean {
  return useSyncExternalStore(
    (avisar) => onlineManager.subscribe(avisar),
    () => onlineManager.isOnline(),
    () => true,
  );
}
