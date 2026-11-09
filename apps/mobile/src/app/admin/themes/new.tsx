import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { CATEGORIES, RULES, THEME_TITLE_LEVELS, registerTheme, type Theme } from '@qu1z/shared';

import { AdminScreen, Dock, Field, Hint, Pills, Segmented, adminStyles, type Notice } from '@/components/admin-ui';
import { Tap } from '@/components/tap';
import { AppText, Button } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, apiBase, ApiError, errorMessage, invalidateAll, TOKEN_KEY } from '@/net/api';
import { pickImage, type PickedImage } from '@/net/media';

type DraftQuestion = { text: string; choices: [string, string, string, string]; difficulty: 1 | 2 | 3 };
const blankQuestion = (): DraftQuestion => ({ text: '', choices: ['', '', '', ''], difficulty: 1 });
const isComplete = (q: DraftQuestion) => !!q.text.trim() && q.choices.every((choice) => !!choice.trim());

const STEPS = ['Infos du thème', 'Images', 'Titres du thème', 'Questions'];

/** Création d'un thème en quatre étapes, une question à la fois. */
export default function AdminNewThemeScreen() {
  const [step, setStep] = useState(0);
  const [current, setCurrent] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [titles, setTitles] = useState(['', '', '', '', '']);
  const [categoryId, setCategoryId] = useState<string>(CATEGORIES[0].id);
  const [questions, setQuestions] = useState<DraftQuestion[]>(Array.from({ length: RULES.questionsPerDuel }, blankQuestion));
  const [icon, setIcon] = useState<PickedImage | null>(null);
  const [cover, setCover] = useState<PickedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const chooseImage = async (kind: 'icon' | 'cover') => {
    try {
      const image = await pickImage('library', kind === 'icon' ? { square: true } : { aspect: [3, 1] });
      if (kind === 'icon') setIcon(image);
      else setCover(image);
    } catch (error) {
      setNotice({ ok: false, text: errorMessage(error) });
    }
  };

  const setQuestion = (index: number, update: Partial<DraftQuestion>) => setQuestions((all) => all.map((question, i) => (i === index ? { ...question, ...update } : question)));

  const uploadAsset = async (themeId: string, kind: 'icon' | 'cover', image: PickedImage) => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) throw new ApiError(401, 'not_connected');
    const blob = await (await fetch(image.uri)).blob();
    const response = await fetch(apiBase() + '/api/admin/themes/' + themeId + '/' + kind, {
      method: 'PUT',
      headers: { authorization: 'Bearer ' + token, 'content-type': image.mimeType ?? blob.type ?? 'application/octet-stream' },
      body: blob,
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new ApiError(response.status, data.error ?? 'error');
  };

  const titlesError = () => {
    const count = titles.filter((title) => title.trim()).length;
    return count !== 0 && (count !== 5 || new Set(titles.map((title) => title.trim())).size !== 5) ? 'Écris les 5 titres, tous différents, ou laisse-les tous vides.' : null;
  };

  const stepError = () => {
    if (step === 0 && (!name.trim() || !description.trim())) return 'Écris le nom et la description du thème.';
    if (step === 1 && (!icon || !cover)) return 'Choisis une photo du thème et une couverture.';
    if (step === 2) return titlesError();
    return null;
  };

  const save = async () => {
    setNotice(null);
    const invalid = questions.findIndex((q) => !isComplete(q));
    if (invalid >= 0) {
      setCurrent(invalid);
      return setNotice({ ok: false, text: `Complète la question ${invalid + 1} et ses quatre réponses.` });
    }
    const duplicate = questions.findIndex((q) => new Set(q.choices.map((choice) => choice.trim().toLocaleLowerCase())).size !== 4);
    if (duplicate >= 0) {
      setCurrent(duplicate);
      return setNotice({ ok: false, text: `Question ${duplicate + 1} : les quatre réponses doivent être différentes.` });
    }
    if (!icon || !cover) {
      setStep(1);
      return setNotice({ ok: false, text: 'Choisis une photo du thème et une couverture.' });
    }
    setBusy(true);
    try {
      const created = await api<{ id: string }>('POST', '/api/admin/themes', {
        name,
        description,
        categoryId,
        titles,
        questions: questions.map((q) => ({ ...q, choices: q.choices.map((choice) => choice.trim()) })),
      });
      await uploadAsset(created.id, 'icon', icon);
      await uploadAsset(created.id, 'cover', cover);
      const { theme } = await api<{ theme: Theme }>('POST', '/api/admin/themes/' + created.id + '/publish');
      registerTheme(theme);
      invalidateAll();
      setNotice({ ok: true, text: 'Thème créé. Il est maintenant disponible dans le jeu.' });
      setName('');
      setDescription('');
      setTitles(['', '', '', '', '']);
      setQuestions(Array.from({ length: RULES.questionsPerDuel }, blankQuestion));
      setIcon(null);
      setCover(null);
      setCurrent(0);
      setStep(0);
    } catch (error) {
      setNotice({ ok: false, text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    const error = stepError();
    setNotice(error ? { ok: false, text: error } : null);
    if (error) return;
    if (step < 3) setStep(step + 1);
    else if (current < questions.length - 1) setCurrent(current + 1);
    else void save();
  };

  const previous = () => {
    setNotice(null);
    if (step === 3 && current > 0) setCurrent(current - 1);
    else setStep(step - 1);
  };

  const addQuestion = () => {
    setQuestions((all) => [...all, blankQuestion()]);
    setCurrent(questions.length);
  };

  const question = questions[current];
  const lastQuestion = step === 3 && current === questions.length - 1;
  const mainLabel = busy ? 'Création…' : step < 3 ? 'Suivant' : lastQuestion ? 'Créer et publier' : 'Question suivante';

  const choiceInput = (index: number, label: string, correct?: boolean) => (
    <TextInput
      key={index}
      value={question.choices[index]}
      onChangeText={(value) => {
        const choices = [...question.choices] as DraftQuestion['choices'];
        choices[index] = value;
        setQuestion(current, { choices });
      }}
      placeholder={label}
      placeholderTextColor={Colors.textMuted}
      accessibilityLabel={label}
      style={[adminStyles.input, correct && styles.correct]}
    />
  );

  return (
    <AdminScreen
      title="Créer un thème"
      notice={notice}
      scrollKey={`${step}-${current}`}
      dock={
        <Dock>
          {step > 0 && (
            <Tap accessibilityRole="button" accessibilityLabel="Revenir en arrière" disabled={busy} onPress={previous} style={styles.back}>
              <Ionicons name="chevron-back" size={22} color={Colors.text} />
            </Tap>
          )}
          <Button label={mainLabel} disabled={busy} onPress={next} style={adminStyles.grow} />
        </Dock>
      }>
      <View style={adminStyles.stack}>
        <View style={styles.progress}>
          {STEPS.map((label, index) => (
            <View key={label} style={[styles.progressPart, index <= step && styles.progressOn]} />
          ))}
        </View>
        <Hint>
          Étape {step + 1} sur {STEPS.length} · {STEPS[step]}
        </Hint>
      </View>

      {step === 0 && (
        <>
          <Field label="Nom du thème">
            <TextInput value={name} onChangeText={setName} maxLength={60} placeholder="Ex. Mythologie grecque" placeholderTextColor={Colors.textMuted} accessibilityLabel="Nom du thème" style={adminStyles.input} />
          </Field>
          <Field label="Description">
            <TextInput value={description} onChangeText={setDescription} maxLength={180} multiline placeholder="Présente le thème en une phrase" placeholderTextColor={Colors.textMuted} accessibilityLabel="Description" style={[adminStyles.input, adminStyles.multiline, { minHeight: 76 }]} />
          </Field>
          <Field label="Catégorie">
            <Pills value={categoryId} onChange={setCategoryId} options={CATEGORIES.map((category) => ({ value: category.id as string, label: `${category.icon} ${category.name}`, color: category.color }))} />
          </Field>
        </>
      )}

      {step === 1 && (
        <>
          <Field label="Icône carrée">
            <Tap accessibilityRole="button" accessibilityLabel="Choisir l’icône carrée" onPress={() => void chooseImage('icon')} style={[styles.pick, styles.pickIcon]}>
              {icon ? <Image source={{ uri: icon.uri }} contentFit="cover" style={StyleSheet.absoluteFill} /> : <PickLabel />}
            </Tap>
          </Field>
          <Field label="Bandeau 3:1">
            <Tap accessibilityRole="button" accessibilityLabel="Choisir le bandeau" onPress={() => void chooseImage('cover')} style={[styles.pick, styles.pickCover]}>
              {cover ? <Image source={{ uri: cover.uri }} contentFit="cover" style={StyleSheet.absoluteFill} /> : <PickLabel />}
            </Tap>
          </Field>
          {(icon || cover) && <Hint>Touche une image pour la remplacer.</Hint>}
        </>
      )}

      {step === 2 && (
        <>
          <Hint>Les 5 ou aucun. Sans titres, le thème utilise la liste générique (Débutant, Amateur…).</Hint>
          {THEME_TITLE_LEVELS.map((level, index) => (
            <Field key={level} label={`Niveau ${level}${level === 100 ? ' · le plus prestigieux' : ''}`}>
              <TextInput
                value={titles[index]}
                maxLength={24}
                accessibilityLabel={'Titre du niveau ' + level}
                onChangeText={(value) => setTitles((all) => all.map((title, i) => (i === index ? value : title)))}
                placeholder={'Titre au niveau ' + level}
                placeholderTextColor={Colors.textMuted}
                style={adminStyles.input}
              />
            </Field>
          ))}
        </>
      )}

      {step === 3 && (
        <>
          <Hint>Au moins {RULES.questionsPerDuel} questions pour rendre le thème jouable.</Hint>
          <View style={styles.numbers}>
            {questions.map((q, index) => {
              const selected = index === current;
              const done = isComplete(q);
              return (
                <Tap key={index} accessibilityRole="button" accessibilityLabel={`Question ${index + 1}${done ? ', complète' : ''}`} accessibilityState={{ selected }} onPress={() => setCurrent(index)} style={[styles.number, done && styles.numberDone, selected && styles.numberOn]}>
                  {done && !selected ? <Ionicons name="checkmark" size={18} color={Colors.violetInk} /> : <AppText color={selected ? Colors.onAccent : Colors.text} style={styles.numberText}>{index + 1}</AppText>}
                </Tap>
              );
            })}
            <Tap accessibilityRole="button" accessibilityLabel="Ajouter une question" onPress={addQuestion} style={styles.number}>
              <Ionicons name="add" size={20} color={Colors.text} />
            </Tap>
          </View>
          <Field label={`Question ${current + 1}`}>
            <TextInput value={question.text} onChangeText={(text) => setQuestion(current, { text })} maxLength={RULES.maxQuestionLength} multiline placeholder="Écris la question" placeholderTextColor={Colors.textMuted} accessibilityLabel={`Question ${current + 1}`} style={[adminStyles.input, adminStyles.multiline, { minHeight: 76 }]} />
          </Field>
          <Field label="Bonne réponse" color={Colors.correct}>
            {choiceInput(0, 'La bonne réponse', true)}
          </Field>
          <Field label="Mauvaises réponses">
            {choiceInput(1, 'Mauvaise réponse 1')}
            {choiceInput(2, 'Mauvaise réponse 2')}
            {choiceInput(3, 'Mauvaise réponse 3')}
          </Field>
          <Field label="Difficulté">
            <Segmented
              value={String(question.difficulty)}
              onChange={(value) => setQuestion(current, { difficulty: Number(value) as DraftQuestion['difficulty'] })}
              options={[
                { value: '1', label: '1' },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
              ]}
            />
          </Field>
        </>
      )}
    </AdminScreen>
  );
}

function PickLabel() {
  return (
    <>
      <Ionicons name="image-outline" size={28} color={Colors.violetInk} />
      <AppText color={Colors.violetInk} style={styles.pickText}>
        Choisir
      </AppText>
    </>
  );
}

const styles = StyleSheet.create({
  back: { width: 56, height: 50, borderRadius: Radius.sm, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  progress: { flexDirection: 'row', gap: 5 },
  progressPart: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  progressOn: { backgroundColor: Colors.accent },
  correct: { borderWidth: 2, borderColor: Colors.correct },
  pick: { alignItems: 'center', justifyContent: 'center', gap: 4, overflow: 'hidden', borderRadius: Radius.md, borderWidth: 2, borderStyle: 'dashed', borderColor: '#CFC6E6', backgroundColor: Colors.surfaceRaised },
  pickIcon: { width: 136, height: 136 },
  pickCover: { width: '100%', aspectRatio: 3 },
  pickText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  numbers: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm - 2 },
  number: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  numberDone: { backgroundColor: Colors.surfaceRaised, borderColor: Colors.surfaceRaised },
  numberOn: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  numberText: { fontSize: 14, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
