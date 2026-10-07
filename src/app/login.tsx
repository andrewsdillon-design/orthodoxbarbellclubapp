import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { errorMessage } from '../api';
import { Roundel } from '../components/brand';
import { Banner, Button, Display, Field, GoldRule, T } from '../components/ui';
import { API_MODE, LINKS } from '../config';
import { useAuth } from '../state/auth';
import { useTheme } from '../theme';

export default function Login() {
  const { c } = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.header }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Roundel size={190} />
        <Display size={26} color={c.headerText} style={s.title}>Orthodox Barbell Club</Display>
        <T style={{ color: '#E8DCC4', textAlign: 'center', marginBottom: 18 }}>
          Strong men, together.
        </T>
        <View style={[s.panel, { backgroundColor: c.card, borderColor: c.gold }]}>
          {API_MODE === 'mock' ? (
            <Banner>Demo mode: sample data, and any email and password will sign you in.</Banner>
          ) : null}
          <View style={{ height: 10 }} />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            onSubmitEditing={submit}
            returnKeyType="go"
          />
          {error ? <T style={{ color: c.danger, marginBottom: 10 }}>{error}</T> : null}
          <Button title="Sign in" onPress={submit} busy={busy} />
          <GoldRule style={{ marginVertical: 16 }} />
          <T muted style={{ textAlign: 'center', marginBottom: 8 }}>New to OBC? Sign up on the website (it takes a minute: waiver and age check).</T>
          <Button title="Create an account" kind="secondary" onPress={() => Linking.openURL(LINKS.signup)} />
          <Button title="Forgot password?" kind="ghost" small onPress={() => Linking.openURL(LINKS.forgot)} style={{ marginTop: 6 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20, paddingTop: 60 },
  title: { marginTop: 14, textAlign: 'center' },
  panel: { width: '100%', maxWidth: 440, borderWidth: 1.5, borderRadius: 8, padding: 16 },
});
