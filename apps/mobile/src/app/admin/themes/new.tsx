import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { CATEGORIES, RULES, THEME_TITLE_LEVELS, registerTheme, type Theme } from '@qu1z/shared';

import { AppText, Button, Card, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { api, apiBase, ApiError, errorMessage, invalidateAll, TOKEN_KEY } from '@/net/api';
import { pickImage, type PickedImage } from '@/net/media';

type DraftQuestion = { text: string; choices: [string, string, string, string]; difficulty: 1 | 2 | 3 };
const blankQuestion = (): DraftQuestion => ({ text: '', choices: ['', '', '', ''], difficulty: 1 });

export default function AdminNewThemeScreen() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [titles, setTitles] = useState(['', '', '', '', '']);
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  const [questions, setQuestions] = useState<DraftQuestion[]>(Array.from({ length: RULES.questionsPerDuel }, blankQuestion));
  const [icon, setIcon] = useState<PickedImage | null>(null);
  const [cover, setCover] = useState<PickedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const chooseImage = async (kind: 'icon' | 'cover') => {
    try {
      const image = await pickImage('library', kind === 'icon' ? { square: true } : { aspect: [3, 1] });
      if (kind === 'icon') setIcon(image);
      else setCover(image);
    } catch (error) {
      setMessage({ ok: false, text: errorMessage(error) });
    }
  };

  const setQuestion = (index: number, update: Partial<DraftQuestion>) =>
    setQuestions((all) => all.map((question, i) => i === index ? { ...question, ...update } : question));

  const uploadAsset = async (themeId: string, kind: 'icon' | 'cover', image: PickedImage) => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) throw new ApiError(401, 'not_connected');
    const blob = await (await fetch(image.uri)).blob();
    const response = await fetch(apiBase() + '/api/admin/themes/' + themeId + '/' + kind, {
      method: 'PUT',
      headers: { authorization: 'Bearer ' + token, 'content-type': image.mimeType ?? blob.type ?? 'application/octet-stream' },
      body: blob,
    });
    const data = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new ApiError(response.status, data.error ?? 'error');
  };

  const save = async () => {
    setMessage(null);
    if (!icon || !cover) return setMessage({ ok: false, text: 'Choisis une photo du thème et une couverture.' });
    const invalid = questions.findIndex((q) => !q.text.trim() || q.choices.some((choice) => !choice.trim()));
    if (invalid >= 0) return setMessage({ ok: false, text: 'Complète chaque question et ses quatre réponses.' });
    if (questions.some((q) => new Set(q.choices.map((choice) => choice.trim().toLocaleLowerCase())).size !== 4)) {
      return setMessage({ ok: false, text: 'Les quatre réponses d’une question doivent être différentes.' });
    }
    const titleCount = titles.filter((title) => title.trim()).length;
    if (titleCount !== 0 && (titleCount !== 5 || new Set(titles.map((title) => title.trim())).size !== 5)) {
      return setMessage({ ok: false, text: 'Écris les 5 titres, tous différents, ou laisse-les tous vides.' });
    }
    setBusy(true);
    try {
      const created = await api<{ id: string }>('POST', '/api/admin/themes', {
        name, description, categoryId, titles,
        questions: questions.map((q) => ({ ...q, choices: q.choices.map((choice) => choice.trim()) })),
      });
      await uploadAsset(created.id, 'icon', icon);
      await uploadAsset(created.id, 'cover', cover);
      const { theme } = await api<{ theme: Theme }>('POST', '/api/admin/themes/' + created.id + '/publish');
      registerTheme(theme);
      invalidateAll();
      setMessage({ ok: true, text: 'Thème créé. Il est maintenant disponible dans le jeu.' });
      setName('');
      setDescription('');
      setTitles(['', '', '', '', '']);
      setQuestions(Array.from({ length: RULES.questionsPerDuel }, blankQuestion));
      setIcon(null);
      setCover(null);
    } catch (error) {
      setMessage({ ok: false, text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back title="Créer un thème">
      <AppText muted>Ajoute au moins {RULES.questionsPerDuel} questions pour rendre le thème jouable.</AppText>
      <Card style={styles.form}>
        <AppText variant="label">Nom du thème</AppText>
        <TextInput value={name} onChangeText={setName} maxLength={60} placeholder="Ex. Mythologie grecque" style={styles.input} />
        <AppText variant="label">Description</AppText>
        <TextInput value={description} onChangeText={setDescription} maxLength={180} placeholder="Présente le thème en une phrase" style={styles.input} />
        <AppText variant="label">Titres du thème (facultatif)</AppText>
        <AppText variant="caption" muted>Les 5 ou aucun. Sans titres, le thème utilise la liste générique (Débutant, Amateur…).</AppText>
        {THEME_TITLE_LEVELS.map((level, index) => (
          <TextInput key={level} value={titles[index]} maxLength={24} accessibilityLabel={'Titre du niveau ' + level}
            onChangeText={(value) => setTitles((all) => all.map((title, i) => i === index ? value : title))}
            placeholder={'Titre au niveau ' + level + (level === 100 ? ' (le plus prestigieux)' : '')} style={styles.input} />
        ))}
        <AppText variant="label">Catégorie</AppText>
        <View style={styles.categories}>
          {CATEGORIES.map((category) => (
            <Button key={category.id} small label={category.icon + ' ' + category.name} color={category.color}
              variant={categoryId === category.id ? 'solid' : 'outline'} onPress={() => setCategoryId(category.id)} />
          ))}
        </View>
        <AppText variant="label">Photo du thème et couverture</AppText>
        <View style={styles.images}>
          <View style={styles.imageChoice}>
            <AppText variant="caption" muted>Icône carrée</AppText>
            {icon ? <Image source={{ uri: icon.uri }} contentFit="cover" style={styles.iconPreview} /> : <View style={styles.iconPreview} />}
            <Button small label="Choisir" variant="outline" onPress={() => void chooseImage('icon')} />
          </View>
          <View style={[styles.imageChoice, { flex: 1 }]}>
            <AppText variant="caption" muted>Bandeau 3:1</AppText>
            {cover ? <Image source={{ uri: cover.uri }} contentFit="cover" style={styles.coverPreview} /> : <View style={styles.coverPreview} />}
            <Button small label="Choisir" variant="outline" onPress={() => void chooseImage('cover')} />
          </View>
        </View>
      </Card>

      <View style={styles.questionsHeading}>
        <AppText variant="heading">Questions · {questions.length}</AppText>
        <Button small label="+ Ajouter" variant="outline" onPress={() => setQuestions((all) => [...all, blankQuestion()])} />
      </View>
      {questions.map((question, index) => (
        <Card key={index} style={styles.form}>
          <AppText variant="label">Question {index + 1} · réponse correcte en premier</AppText>
          <TextInput value={question.text} onChangeText={(text) => setQuestion(index, { text })} placeholder="Écris la question" style={styles.input} />
          {question.choices.map((choice, choiceIndex) => (
            <TextInput key={choiceIndex} value={choice} onChangeText={(value) => {
              const choices = [...question.choices] as DraftQuestion['choices'];
              choices[choiceIndex] = value;
              setQuestion(index, { choices });
            }} placeholder={choiceIndex === 0 ? 'Bonne réponse' : 'Mauvaise réponse ' + choiceIndex} style={styles.input} />
          ))}
          <View style={styles.difficulty}>
            <AppText variant="caption" muted>Difficulté</AppText>
            {[1, 2, 3].map((value) => (
              <Button key={value} small label={String(value)} variant={question.difficulty === value ? 'solid' : 'outline'}
                color={Colors.accent} onPress={() => setQuestion(index, { difficulty: value as DraftQuestion['difficulty'] })} />
            ))}
          </View>
        </Card>
      ))}
      {message && <AppText color={message.ok ? Colors.correct : Colors.wrong}>{message.text}</AppText>}
      <Button label={busy ? 'Création…' : 'Créer et publier le thème'} disabled={busy} onPress={() => void save()} />
    </Screen>
  );
}


const styles = StyleSheet.create({
  form: { gap: Spacing.sm },
  input: { backgroundColor: Colors.surfaceRaised, borderRadius: 12, color: Colors.text, padding: Spacing.sm, minHeight: 44 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  images: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  imageChoice: { alignItems: 'flex-start', gap: Spacing.xs },
  iconPreview: { width: 90, height: 90, borderRadius: 16, backgroundColor: Colors.surfaceRaised },
  coverPreview: { width: '100%', height: 90, borderRadius: 12, backgroundColor: Colors.surfaceRaised },
  questionsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  difficulty: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
