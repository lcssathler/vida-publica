import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Configuração dinâmica sobre o app.json: os logins opcionais e os avisos só
 * entram no build quando configurados.
 * - VP_LOGIN_APPLE=1 liga a capacidade "Sign in with Apple" no iOS.
 * - VP_GOOGLE_IOS_URL_SCHEME (com.googleusercontent.apps...) liga o plugin do
 *   Google; os client IDs vão em EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID e
 *   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID.
 * - VP_FIREBASE_ANDROID_JSON: caminho do google-services.json do projeto no
 *   Firebase (fora do repositório). Sem ele, o Android não tem token do FCM.
 * - VP_FIREBASE_IOS_PLIST: caminho do GoogleService-Info.plist (fora do
 *   repositório). Liga o React Native Firebase Messaging, que troca o token
 *   da APNs pelo token do FCM. Sem ele, o iOS não registra token.
 * Nenhum desses arquivos é segredo de servidor, mas ficam fora do git.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const plugins = [...(config.plugins ?? [])];
  const esquemaGoogle = process.env.VP_GOOGLE_IOS_URL_SCHEME;
  if (esquemaGoogle) {
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme: esquemaGoogle }]);
  }
  if (process.env.VP_LOGIN_APPLE === '1') plugins.push('expo-apple-authentication');
  const firebaseAndroid = process.env.VP_FIREBASE_ANDROID_JSON;
  const firebaseIos = process.env.VP_FIREBASE_IOS_PLIST;
  if (firebaseIos) {
    plugins.push(
      '@react-native-firebase/app',
      '@react-native-firebase/messaging',
      // O SDK do Firebase no iOS vem pelo Swift Package Manager, que pede frameworks dinâmicos.
      ['expo-build-properties', { ios: { useFrameworks: 'dynamic' } }],
    );
  }
  return {
    ...config,
    name: config.name ?? 'Vida Pública',
    slug: config.slug ?? 'vida-publica',
    plugins,
    ios: {
      ...config.ios,
      usesAppleSignIn: process.env.VP_LOGIN_APPLE === '1',
      ...(firebaseIos ? { googleServicesFile: firebaseIos } : {}),
    },
    android: {
      ...config.android,
      ...(firebaseAndroid ? { googleServicesFile: firebaseAndroid } : {}),
    },
    extra: { ...config.extra, fcmIos: !!firebaseIos },
  };
};
