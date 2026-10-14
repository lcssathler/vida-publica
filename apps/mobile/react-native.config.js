// O React Native Firebase só entra no iOS, onde troca o token da APNs pelo
// token do FCM. No Android, o token do FCM vem do expo-notifications, e um
// segundo serviço de mensagens do Firebase disputaria os avisos com ele.
module.exports = {
  dependencies: {
    '@react-native-firebase/app': { platforms: { android: null } },
    '@react-native-firebase/messaging': { platforms: { android: null } },
  },
};
