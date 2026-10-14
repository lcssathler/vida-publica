import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Pede a permissão do sistema, só depois que a pessoa aceitou a pré-pergunta
 * do app. Não registra token de envio: isso é da Fase 7 (FCM).
 * Na web, ver permissao.web.ts.
 */
export async function pedirPermissaoDoSistema(): Promise<boolean> {
  const atual = await Notifications.getPermissionsAsync();
  if (atual.granted) return true;
  if (!atual.canAskAgain) return false;
  if (Platform.OS === 'android') {
    // No Android 13+, o pedido só aparece depois que existe um canal.
    await Notifications.setNotificationChannelAsync('avisos', {
      name: 'Avisos de quem você segue',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const resposta = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: false },
  });
  return (
    resposta.granted ||
    resposta.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}
