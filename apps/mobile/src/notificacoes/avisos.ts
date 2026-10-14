import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useSessao } from '../sessao/Sessao';
import { registrarAparelho } from './aparelho';
import { eventoDoAviso } from './link';
import { ouvirTrocaDeToken } from './token';

// Com o app aberto, o aviso aparece na faixa e na lista, sem som.
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
});

/**
 * Avisos no aparelho, depois do onboarding:
 * - se a pessoa aceitou os avisos (`ligado`), registra o token de envio na
 *   abertura do app e de novo quando o FCM o troca (a permissão do sistema é
 *   conferida antes; nada é pedido aqui);
 * - tocar num aviso abre o registro com a fonte (`/evento/{id}`).
 */
export function useAvisos(ligado: boolean) {
  const { cliente } = useSessao();
  const resposta = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!ligado) return;
    const registrar = () => void registrarAparelho(cliente).catch(() => {});
    registrar();
    return ouvirTrocaDeToken(registrar);
  }, [ligado, cliente]);

  useEffect(() => {
    const id = eventoDoAviso(resposta);
    if (!id) return;
    router.push(`/evento/${id}`);
    Notifications.clearLastNotificationResponse();
  }, [resposta]);
}
