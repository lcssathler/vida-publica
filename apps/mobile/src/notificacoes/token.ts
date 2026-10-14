import * as Notifications from 'expo-notifications';

/**
 * Token de envio do FCM no Android: o token nativo do expo-notifications já é
 * o token de registro do FCM. Exige o google-services.json no build
 * (VP_FIREBASE_ANDROID_JSON, ver app.config.ts); sem ele, não há token.
 * No iOS, ver token.ios.ts; na web, token.web.ts.
 */
export async function tokenDeEnvio(): Promise<string | null> {
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    return token.type === 'android' && typeof token.data === 'string' ? token.data : null;
  } catch {
    return null;
  }
}

/** Avisa quando o FCM troca o token do aparelho. */
export function ouvirTrocaDeToken(aoTrocar: (token: string) => void): () => void {
  const assinatura = Notifications.addPushTokenListener((token) => {
    if (token.type === 'android' && typeof token.data === 'string') aoTrocar(token.data);
  });
  return () => assinatura.remove();
}
