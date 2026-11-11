import * as DocumentPicker from 'expo-document-picker';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { THEMES, type Theme } from '@qu1z/shared';

import { AdminScreen, Field, Hint, adminStyles, type Notice } from '@/components/admin-ui';
import { Tap } from '@/components/tap';
import { AppText, Button, Card } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, invalidateAll, useApi } from '@/net/api';

type Row = { line: number; text: string; choices: string[]; difficulty?: number };
type Report = { added: number; valid: number; duplicates: number; invalid: { line: number; reason: string }[]; total: number | null };

/** Découpe une ligne CSV (guillemets acceptés) avec le séparateur donné. */
function splitLine(line: string, sep: string): string[] {
  const cells: string[] = [];
  let cell = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell.trim()) { quoted = true; cell = ''; }
    else if (c === sep) { cells.push(cell.trim()); cell = ''; }
    else cell += c;
  }
  cells.push(cell.trim());
  return cells;
}

/** Format : question ; bonne réponse ; mauvaise 1 ; mauvaise 2 ; mauvaise 3 [; difficulté 1-3]. */
function parseCsv(content: string): Row[] {
  const lines = content.replace(/^﻿/, '').split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  if (first < 0) return [];
  const sample = lines[first];
  const sep = [';', '\t', ','].sort((a, b) => sample.split(b).length - sample.split(a).length)[0];
  const rows: Row[] = [];
  lines.forEach((raw, index) => {
    if (!raw.trim()) return;
    const cells = splitLine(raw, sep);
    if (index === first && /^question/i.test(cells[0] ?? '')) return; // ligne d'en-tête
    const difficulty = Number(cells[5]);
    rows.push({ line: index + 1, text: cells[0] ?? '', choices: cells.slice(1, 5), difficulty: [1, 2, 3].includes(difficulty) ? difficulty : undefined });
  });
  return rows;
}

/** Import rapide de questions depuis un CSV (par ex. généré par une IA), avec aperçu avant d'enregistrer. */
export default function ImportQuestionsScreen() {
  const me = useApi<{ role: string }>('/api/me');
  const admin = me.data?.role === 'admin';
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState<Theme | null>(null);
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const rows = useMemo(() => parseCsv(content), [content]);
  const matches = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return q ? THEMES.filter((t) => t.name.toLocaleLowerCase().includes(q)).slice(0, 8) : [];
  }, [search]);

  const reset = () => { setPreview(null); setNotice(null); };
  const pickFile = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets[0]) return;
    const file = picked.assets[0];
    const text = file.file ? await file.file.text() : await (await fetch(file.uri)).text();
    setFileName(file.name); setContent(text); reset();
  };
  const send = async (dryRun: boolean) => {
    if (!theme || !rows.length) return;
    setBusy(true); setNotice(null);
    try {
      const report = await api<Report>('POST', `/api/admin/themes/${theme.id}/questions/import`, { questions: rows, dryRun });
      if (dryRun) setPreview(report);
      else {
        setPreview(null); setContent(''); setFileName(null);
        invalidateAll();
        setNotice({ ok: true, text: `${report.added} question${report.added > 1 ? 's' : ''} ajoutée${report.added > 1 ? 's' : ''} à « ${theme.name} » (${report.total} au total).` });
      }
    } catch (e) { setNotice({ ok: false, text: errorMessage(e) }); }
    finally { setBusy(false); }
  };

  if (me.data && !admin) {
    return <AdminScreen title="Importer des questions"><AppText muted>Accès réservé aux administrateurs.</AppText></AdminScreen>;
  }

  return (
    <AdminScreen title="Importer des questions">
      <View style={adminStyles.stack}>
        <Card style={styles.gap}>
          <AppText variant="label">Format attendu (une question par ligne)</AppText>
          <AppText style={styles.mono}>question;bonne réponse;mauvaise 1;mauvaise 2;mauvaise 3</AppText>
          <Hint>La bonne réponse est toujours en 2ᵉ colonne : l'ordre est mélangé pendant le duel. Une 6ᵉ colonne facultative donne la difficulté (1, 2 ou 3). Séparateur « ; », « , » ou tabulation.</Hint>
        </Card>

        <Field label="1. Thème">
          {theme ? (
            <View style={styles.chosen}>
              <AppText style={{ flex: 1 }} variant="label">{theme.name}</AppText>
              <Button small variant="outline" label="Changer" onPress={() => { setTheme(null); reset(); }} />
            </View>
          ) : (
            <View style={styles.gap}>
              <TextInput value={search} onChangeText={setSearch} placeholder="Chercher un thème…" placeholderTextColor={Colors.textMuted} style={adminStyles.input} accessibilityLabel="Chercher un thème" />
              {matches.map((t) => (
                <Tap key={t.id} onPress={() => { setTheme(t); setSearch(''); reset(); }} style={styles.match} accessibilityRole="button">
                  <AppText>{t.name}</AppText>
                  <AppText muted variant="caption">{t.questionCount} questions</AppText>
                </Tap>
              ))}
            </View>
          )}
        </Field>

        <Field label="2. Questions">
          <View style={styles.gap}>
            <Button variant="outline" label={fileName ? `Fichier : ${fileName}` : 'Choisir un fichier CSV'} onPress={pickFile} />
            <Hint>… ou colle directement le texte donné par l'IA :</Hint>
            <TextInput value={content} onChangeText={(t) => { setContent(t); setFileName(null); reset(); }} multiline placeholder="Colle les lignes ici" placeholderTextColor={Colors.textMuted} style={[adminStyles.input, styles.area]} accessibilityLabel="Contenu CSV" />
            {!!rows.length && <Hint>{rows.length} ligne{rows.length > 1 ? 's' : ''} lue{rows.length > 1 ? 's' : ''}.</Hint>}
          </View>
        </Field>

        {preview && (
          <Card style={styles.gap}>
            <AppText variant="label">Aperçu</AppText>
            <AppText>✅ {preview.valid} prête{preview.valid > 1 ? 's' : ''} à ajouter</AppText>
            {!!preview.duplicates && <AppText muted>↩︎ {preview.duplicates} déjà dans le thème (ignorée{preview.duplicates > 1 ? 's' : ''})</AppText>}
            {!!preview.invalid.length && <AppText color={Colors.accentInk}>⚠️ {preview.invalid.length} ligne{preview.invalid.length > 1 ? 's' : ''} en erreur</AppText>}
            {preview.invalid.slice(0, 20).map((e) => <Hint key={e.line}>Ligne {e.line} : {e.reason}</Hint>)}
            {rows.slice(0, 3).map((r) => (
              <View key={r.line} style={styles.sample}>
                <AppText variant="label">{r.text}</AppText>
                <AppText variant="caption" color="#1E9E5A">✓ {r.choices[0]}</AppText>
                <AppText variant="caption" muted>✗ {r.choices.slice(1).join(' · ')}</AppText>
              </View>
            ))}
          </Card>
        )}

        {notice && <AppText color={notice.ok ? '#1E9E5A' : Colors.accentInk}>{notice.text}</AppText>}

        {preview ? (
          <Button label={busy ? 'Ajout…' : `Ajouter ${preview.valid} question${preview.valid > 1 ? 's' : ''}`} disabled={busy || !preview.valid} onPress={() => send(false)} />
        ) : (
          <Button label={busy ? 'Analyse…' : 'Vérifier'} disabled={busy || !theme || !rows.length} onPress={() => send(true)} />
        )}
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.xs },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  chosen: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  match: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, borderRadius: Radius.md, backgroundColor: Colors.surfaceRaised },
  area: { minHeight: 140, textAlignVertical: 'top' },
  sample: { gap: 2, paddingTop: Spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
});
