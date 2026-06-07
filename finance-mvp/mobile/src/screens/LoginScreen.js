import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { api, setToken } from '../api';
import { theme } from '../theme';

export default function LoginScreen({ onAuthed }) {
  const [email, setEmail] = useState('test1@example.com');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const res = await api.login({ email, password });
      if (!res?.token) throw new Error(res?.message || 'Login failed');
      await setToken(res.token);
      onAuthed();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.brand}>TerraVest</Text>
      <Text style={styles.sub}>Your finances, investments, and plan — in one place.</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity style={styles.btn} onPress={submit} disabled={busy}>
          <Text style={styles.btnText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.colors.forest, justifyContent: 'center', padding: 24 },
  brand: { fontSize: 30, color: '#fff', textAlign: 'center' },
  sub: { color: theme.colors.sagePale, textAlign: 'center', marginBottom: 24, marginTop: 6 },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: 24 },
  label: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 12, fontSize: 15 },
  btn: { backgroundColor: theme.colors.forest, borderRadius: theme.radius.md, padding: 14, marginTop: 20, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600' },
  error: { color: theme.colors.negative, marginTop: 12 },
});
