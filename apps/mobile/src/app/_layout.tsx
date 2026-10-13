import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts(fonts);
  const theme = useTheme();
  const scheme = useColorScheme();

  if (!fontsLoaded) return null;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.paper },
        }}
      />
    </>
  );
}
