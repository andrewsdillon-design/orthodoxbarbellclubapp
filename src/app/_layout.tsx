import { Archivo_400Regular, Archivo_600SemiBold, Archivo_700Bold } from '@expo-google-fonts/archivo';
import { Cinzel_400Regular, Cinzel_700Bold } from '@expo-google-fonts/cinzel';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../state/auth';
import { persistCache, queryClient } from '../state/queryClient';
import { useAutoSync } from '../state/sync';
import { fonts, ThemeProvider, useTheme } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded] = useFonts({ Cinzel_400Regular, Cinzel_700Bold, Archivo_400Regular, Archivo_600SemiBold, Archivo_700Bold });
  useEffect(() => persistCache(), []);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>{loaded ? <AppStack /> : null}</AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function AppStack() {
  const { c } = useTheme();
  const { status } = useAuth();
  useAutoSync(status === 'signedIn');
  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync().catch(() => {});
  }, [status]);
  if (status === 'loading') return null;

  const base = c.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: c.bg, card: c.header, text: c.headerText, border: c.gold, primary: c.gold } };
  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.header },
          headerTintColor: c.headerText,
          headerTitleStyle: { fontFamily: fonts.display, fontSize: 18 },
          contentStyle: { backgroundColor: c.bg },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Protected guard={status === 'signedIn'}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="session/[week]/[day]" options={{ title: 'Session' }} />
          <Stack.Screen name="enroll" options={{ title: 'Choose a program', presentation: 'modal' }} />
          <Stack.Screen name="submit-max" options={{ title: 'Submit a max', presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack.Protected>
        <Stack.Protected guard={status === 'signedOut'}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </NavThemeProvider>
  );
}
