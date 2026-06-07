import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { api, setToken } from '../api';
import { theme } from '../theme';

const money = (v) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v ?? 0);

export default function HomeScreen({ onLogout }) {
  const [snapshot, setSnapshot] = useState(null);
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [s, a] = await Promise.all([api.getSnapshot(), api.getAccounts()]);
        setSnapshot(s);
        setAccounts(Array.isArray(a) ? a : []);
      } catch (e) {
        // session handling done in api; ignore here
      }
    })();
  }, []);

  async function logout() {
    await setToken(null);
    onLogout();
  }

  const net = snapshot?.netWorth?.total ?? 0;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Home</Text>
        <TouchableOpacity onPress={logout}><Text style={styles.link}>Sign out</Text></TouchableOpacity>
      </View>

      <View style={styles.kpi}>
        <Text style={styles.kpiLabel}>Net Worth</Text>
        <Text style={styles.kpiValue}>{money(net)}</Text>
      </View>

      <Text style={styles.section}>Accounts</Text>
      {accounts.length === 0 ? (
        <Text style={styles.muted}>No accounts linked yet.</Text>
      ) : (
        accounts.map((acc) => (
          <View key={acc.id} style={styles.row}>
            <Text style={styles.rowName}>{acc.name}</Text>
            <Text style={styles.rowAmt}>{money(acc.currentBalance)}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.colors.bg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 26, color: theme.colors.textPrimary },
  link: { color: theme.colors.forestLight, fontWeight: '600' },
  kpi: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 18, marginBottom: 16 },
  kpiLabel: { color: theme.colors.textMuted, fontSize: 12 },
  kpiValue: { fontSize: 28, color: theme.colors.textPrimary, marginTop: 4 },
  section: { fontSize: 16, fontWeight: '600', marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: theme.colors.card, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: 14, marginBottom: 8 },
  rowName: { color: theme.colors.textPrimary, fontWeight: '500' },
  rowAmt: { color: theme.colors.textPrimary, fontWeight: '600' },
  muted: { color: theme.colors.textMuted },
});
