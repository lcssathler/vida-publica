import Constants from 'expo-constants';

/**
 * Token de envio do FCM no iOS. O token nativo do iOS é o da APNs, que o FCM
 * não aceita: o SDK do Firebase (React Native Firebase Messaging) registra o
 * aparelho na APNs e devolve o token de registro do FCM. Só existe no build
 * configurado com o GoogleService-Info.plist (VP_FIREBASE_IOS_PLIST, ver
 * app.config.ts); sem ele, o iOS não registra token.
 */
const ligado = Constants.expoConfig?.extra?.fcmIos === true;

export async function tokenDeEnvio(): Promise<string | null> {
  if (!ligado) return null;
  try {
    const { getMessaging, getToken, registerDeviceForRemoteMessages } = await import(
      '@react-native-firebase/messaging'
    );
    const mensagens = getMessaging();
    await registerDeviceForRemoteMessages(mensagens);
    return await getToken(mensagens);
  } catch {
    return null;
  }
}

/** Avisa quando o FCM troca o token do aparelho. */
export function ouvirTrocaDeToken(aoTrocar: (token: string) => void): () => void {
  if (!ligado) return () => {};
  let cancelar: () => void = () => {};
  let ativo = true;
  import('@react-native-firebase/messaging')
    .then(({ getMessaging, onTokenRefresh }) => {
      if (ativo) cancelar = onTokenRefresh(getMessaging(), aoTrocar);
    })
    .catch(() => {});
  return () => {
    ativo = false;
    cancelar();
  };
}
