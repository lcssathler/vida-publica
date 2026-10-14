import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Configuração dinâmica sobre o app.json: os logins opcionais só entram no
 * build quando configurados (nenhum deles é segredo; são identificadores
 * públicos do app nos provedores).
 * - VP_LOGIN_APPLE=1 liga a capacidade "Sign in with Apple" no iOS.
 * - VP_GOOGLE_IOS_URL_SCHEME (com.googleusercontent.apps...) liga o plugin do
 *   Google; os client IDs vão em EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID e
 *   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const plugins = [...(config.plugins ?? [])];
  const esquemaGoogle = process.env.VP_GOOGLE_IOS_URL_SCHEME;
  if (esquemaGoogle) {
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme: esquemaGoogle }]);
  }
  if (process.env.VP_LOGIN_APPLE === '1') plugins.push('expo-apple-authentication');
  return {
    ...config,
    name: config.name ?? 'Vida Pública',
    slug: config.slug ?? 'vida-publica',
    plugins,
    ios: { ...config.ios, usesAppleSignIn: process.env.VP_LOGIN_APPLE === '1' },
  };
};
