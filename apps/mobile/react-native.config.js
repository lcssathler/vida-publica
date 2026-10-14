// O React Native Firebase só entra no iOS, onde troca o token da APNs pelo
// token do FCM, e só quando o build tem o GoogleService-Info.plist
// (VP_FIREBASE_IOS_PLIST, ver app.config.ts); sem ele, o SDK ficaria sem
// configuração. No Android, o token do FCM vem do expo-notifications, e um
// segundo serviço de mensagens do Firebase disputaria os avisos com ele.
const plataformas = process.env.VP_FIREBASE_IOS_PLIST
  ? { android: null }
  : { android: null, ios: null };

module.exports = {
  dependencies: {
    '@react-native-firebase/app': { platforms: plataformas },
    '@react-native-firebase/messaging': { platforms: plataformas },
  },
};
