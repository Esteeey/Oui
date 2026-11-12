import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioSource } from 'expo-audio';
import { useEffect, useState } from 'react';

import type { GameSoundId, SoundOverride } from '@qu1z/shared';

import { api, apiBase } from '@/net/api';

/**
 * Sons et musiques de Qu1z : tous originaux, synthétisés pour l'appli (scripts de génération hors dépôt).
 * Effets : un lecteur préchargé par son, rembobiné à chaque lecture.
 * Musiques : une seule à la fois (musiques de recherche et de duel en boucle, ou musique de résultat).
 * Un administrateur peut remplacer chaque son depuis le panneau d'administration : le remplacement,
 * servi par le serveur de jeu, prend la place du son d'origine.
 */
const SFX = {
  playMenu: require('../../assets/sounds/qz_menu_ouvrir.wav'),
  launch: require('../../assets/sounds/qz_lancement.wav'),
  pinPop: require('../../assets/sounds/qz_pop.wav'),
  versus: require('../../assets/sounds/s10_vs.wav'),
  question: require('../../assets/sounds/qz_question.wav'),
  choices: require('../../assets/sounds/qz_reponses.wav'),
  bonusRound: require('../../assets/sounds/s09_manche_bonus.wav'),
  answered: require('../../assets/sounds/qz_reponse_validee.wav'),
  tick: require('../../assets/sounds/qz_tic_tac.wav'),
  correct: require('../../assets/sounds/qz_bonne_reponse.wav'),
  wrong: require('../../assets/sounds/qz_mauvaise_reponse.wav'),
  timeout: require('../../assets/sounds/qz_temps_ecoule.wav'),
  opponentCorrect: require('../../assets/sounds/qz_adversaire_juste.wav'),
  opponentWrong: require('../../assets/sounds/qz_adversaire_faux.wav'),
  endWin: require('../../assets/sounds/qz_fin_victoire.wav'),
  endLoss: require('../../assets/sounds/qz_fin_defaite.wav'),
  endDraw: require('../../assets/sounds/qz_fin_egalite.wav'),
  xp: require('../../assets/sounds/qz_xp.wav'),
  xpTick: require('../../assets/sounds/qz_xp_cran.wav'),
  xpEnd: require('../../assets/sounds/qz_xp_fin.wav'),
  levelUp: require('../../assets/sounds/qz_niveau.wav'),
} as const;

const MUSIC = {
  search: require('../../assets/sounds/qz_musique_recherche.mp3'),
  duel: require('../../assets/sounds/qz_musique_duel.mp3'),
  win: require('../../assets/sounds/qz_musique_victoire.mp3'),
  loss: require('../../assets/sounds/qz_musique_defaite.mp3'),
  draw: require('../../assets/sounds/qz_musique_egalite.mp3'),
} as const;

export type SoundName = keyof typeof SFX;
export type MusicName = keyof typeof MUSIC;

/** Identifiant de chaque musique dans le catalogue partagé des sons (panneau d'administration). */
const MUSIC_ID: Record<MusicName, GameSoundId> = { search: 'musicSearch', duel: 'musicDuel', win: 'musicWin', loss: 'musicLoss', draw: 'musicDraw' };

/** Son d'origine, livré avec l'appli. */
export function defaultSoundSource(id: GameSoundId): number {
  const music = (Object.keys(MUSIC_ID) as MusicName[]).find((m) => MUSIC_ID[m] === id);
  return music ? MUSIC[music] : SFX[id as SoundName];
}

// ---------------------------------------------------------------- sons remplacés par l'administration

/** Adresse complète des sons remplacés, par identifiant. */
let overrides = new Map<GameSoundId, string>();
let overridesFetchedAt = 0;

/** Son à jouer : celui choisi par l'administration s'il existe, sinon celui d'origine. */
export function soundSource(id: GameSoundId): AudioSource {
  const url = overrides.get(id);
  return url ? { uri: url } : defaultSoundSource(id);
}

/**
 * Récupère les sons remplacés (au plus une fois par minute, sauf `force`) et met à jour les lecteurs déjà créés.
 * Sans connexion ou en cas d'erreur, les sons d'origine restent.
 */
export async function refreshSoundOverrides(force = false): Promise<void> {
  if (!force && Date.now() - overridesFetchedAt < 60_000) return;
  overridesFetchedAt = Date.now();
  let list: SoundOverride[];
  try {
    list = (await api<{ sounds: SoundOverride[] }>('GET', '/api/sounds')).sounds;
  } catch {
    overridesFetchedAt = 0;
    return;
  }
  const next = new Map(list.map((o) => [o.id, o.url.startsWith('/') ? `${apiBase()}${o.url}` : o.url] as const));
  const previous = overrides;
  overrides = next;
  const changed = (id: GameSoundId) => previous.get(id) !== next.get(id);
  // On recrée les lecteurs concernés plutôt que de changer leur fichier : sur Android, changer la source
  // d'un lecteur déjà chargé ne prend pas toujours effet, et l'ancien son restait.
  for (const name of [...players.keys()]) {
    if (!changed(name)) continue;
    release(players.get(name));
    try {
      players.set(name, createAudioPlayer(soundSource(name)));
    } catch {
      players.delete(name);
    }
  }
  for (const name of [...musicPlayers.keys()]) {
    if (!changed(MUSIC_ID[name])) continue;
    const old = musicPlayers.get(name)!;
    // Pas `old.playing` : un lecteur tout juste créé, encore en chargement, n'est pas « en lecture »,
    // et la musique ne reprenait alors jamais avec le nouveau fichier.
    const wasPlaying = current === name && musicEnabled;
    musicPlayers.delete(name);
    release(old);
    // La musique en cours reprend aussitôt avec le nouveau fichier (et son entrée en fondu complète).
    if (wasPlaying) start(name);
  }
}

function release(player: AudioPlayer | undefined) {
  if (!player) return;
  const fade = fades.get(player);
  if (fade) {
    clearInterval(fade);
    fades.delete(player);
  }
  try {
    player.pause();
    player.remove();
  } catch {}
}

/** Dans le fichier de l'intro VS, le choc tombe 250 ms après le début : on le lance d'autant en avance. */
export const VERSUS_HIT_OFFSET_MS = 250;
/** Le tic-tac dure 5 s : il démarre quand il reste 5 s pour répondre. */
export const TICK_WINDOW_MS = 5000;
/** Durée du son de montée d'XP. */
export const XP_SOUND_MS = 1650;

const MUSIC_VOLUME: Record<MusicName, number> = { search: 0.4, duel: 0.35, win: 0.6, loss: 0.6, draw: 0.6 };

// ---------------------------------------------------------------- préférences

const SOUND_KEY = 'qu1z.sound';
const MUSIC_KEY = 'qu1z.music';
let sfxEnabled = true;
let musicEnabled = true;
const sfxListeners = new Set<(on: boolean) => void>();
const musicListeners = new Set<(on: boolean) => void>();

// Préférences enregistrées : lues une fois au démarrage.
AsyncStorage.multiGet([SOUND_KEY, MUSIC_KEY])
  .then(([[, sound], [, music]]) => {
    if (sound === 'off') setSoundEnabled(false);
    if (music === 'off') setMusicEnabled(false);
  })
  .catch(() => {});

// ---------------------------------------------------------------- effets

const players = new Map<SoundName, AudioPlayer>();
let prepared = false;

function prepare() {
  if (prepared) return;
  prepared = true;
  // Les sons du jeu se mêlent à la musique de l'utilisateur et suivent le mode silencieux de l'iPhone.
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  refreshSoundOverrides().catch(() => {});
  for (const name of Object.keys(SFX) as SoundName[]) {
    try {
      players.set(name, createAudioPlayer(soundSource(name)));
    } catch {
      // Sans lecteur, le son est simplement muet.
    }
  }
}

/** Joue un effet (sans effet si les sons sont coupés). Ne lève jamais d'erreur. */
export function playSound(name: SoundName) {
  if (!sfxEnabled) return;
  prepare();
  const player = players.get(name);
  if (!player) return;
  try {
    player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // Lecture refusée (ex. navigateur avant toute interaction) : on ignore.
  }
}

/** Coupe un effet en cours (ex. le tic-tac quand on répond). */
export function stopSound(name: SoundName) {
  const player = players.get(name);
  try {
    if (player?.playing) player.pause();
  } catch {}
}

/** Précharge les effets, par exemple à l'ouverture de l'écran de duel, et vérifie les sons remplacés. */
export function preloadSounds() {
  if (sfxEnabled) prepare();
  refreshSoundOverrides().catch(() => {});
}

export function setSoundEnabled(on: boolean) {
  sfxEnabled = on;
  if (!on) players.forEach((p) => {
    try {
      if (p.playing) p.pause();
    } catch {}
  });
  AsyncStorage.setItem(SOUND_KEY, on ? 'on' : 'off').catch(() => {});
  sfxListeners.forEach((l) => l(on));
}

// ---------------------------------------------------------------- musiques

const musicPlayers = new Map<MusicName, AudioPlayer>();
/** Musiques jouées en boucle (avec une entrée en fondu). */
const LOOPED = new Set<MusicName>(['search', 'duel']);
let current: MusicName | null = null;
const fades = new Map<AudioPlayer, ReturnType<typeof setInterval>>();

function musicPlayer(name: MusicName): AudioPlayer | null {
  let player = musicPlayers.get(name);
  if (!player) {
    try {
      prepare();
      player = createAudioPlayer(soundSource(MUSIC_ID[name]));
      player.loop = LOOPED.has(name);
      musicPlayers.set(name, player);
    } catch {
      return null;
    }
  }
  return player;
}

/** Passe le volume d'une musique à `target` en `ms` millisecondes. */
function fadeTo(player: AudioPlayer, target: number, ms: number, done?: () => void) {
  const running = fades.get(player);
  if (running) clearInterval(running);
  const start = player.volume;
  const steps = Math.max(1, Math.round(ms / 50));
  let i = 0;
  const id = setInterval(() => {
    i++;
    try {
      player.volume = start + ((target - start) * i) / steps;
    } catch {}
    if (i >= steps) {
      clearInterval(id);
      fades.delete(player);
      done?.();
    }
  }, 50);
  fades.set(player, id);
}

function fadeOut(name: MusicName, ms: number) {
  const player = musicPlayers.get(name);
  if (!player) return;
  fadeTo(player, 0, ms, () => {
    try {
      if (current !== name) player.pause();
    } catch {}
  });
}

/** Numéro du dernier lancement de musique : un écran n'arrête que la musique qu'il a lui-même lancée. */
let session = 0;

/**
 * Lance une musique depuis le début, en arrêtant (en fondu) celle qui jouait.
 * Renvoie de quoi l'arrêter : sans effet si une autre musique (ou la même, relancée par un autre écran)
 * a pris le relais entre-temps. Sinon, l'écran qui se ferme pendant que le suivant s'ouvre
 * (ex. annuler une recherche puis en relancer une aussitôt) coupait la musique du nouvel écran.
 */
export function playMusic(name: MusicName): (ms?: number) => void {
  if (current && current !== name) fadeOut(current, 500);
  current = name;
  const mine = ++session;
  const stop = (ms = 700) => {
    if (session === mine) stopMusic(name, ms);
  };
  if (musicEnabled) start(name);
  return stop;
}

/** Lecture depuis le début, avec une entrée en fondu pour les musiques en boucle. */
function start(name: MusicName) {
  const player = musicPlayer(name);
  if (!player) return;
  const looped = LOOPED.has(name);
  try {
    player.volume = looped ? 0 : MUSIC_VOLUME[name];
  } catch {}
  // Rembobinage séparé de la lecture : sur un lecteur encore en chargement, il peut échouer,
  // et la musique ne devait pas rester muette pour autant.
  try {
    if (player.currentTime > 0) player.seekTo(0).catch(() => {});
  } catch {}
  try {
    player.play();
  } catch {}
  if (looped) fadeTo(player, MUSIC_VOLUME[name], 800);
}

/** Arrête la musique en cours (en fondu). Sans nom, arrête celle qui joue ; avec un nom, seulement si c'est elle. */
export function stopMusic(name?: MusicName, ms = 700) {
  if (!current || (name && name !== current)) return;
  const playing = current;
  current = null;
  session++;
  fadeOut(playing, ms);
}

export function setMusicEnabled(on: boolean) {
  musicEnabled = on;
  AsyncStorage.setItem(MUSIC_KEY, on ? 'on' : 'off').catch(() => {});
  musicListeners.forEach((l) => l(on));
  if (!current) return;
  const player = musicPlayers.get(current);
  if (!on) {
    if (player) fadeTo(player, 0, 200, () => player.pause());
  } else if (LOOPED.has(current)) {
    start(current); // les musiques de résultat, courtes, ne sont pas relancées
  }
}

// ---------------------------------------------------------------- réglages

function useFlag(get: () => boolean, set: (on: boolean) => void, listeners: Set<(on: boolean) => void>): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(get);
  useEffect(() => {
    listeners.add(setOn);
    return () => {
      listeners.delete(setOn);
    };
  }, [listeners]);
  return [on, set];
}

/** Interrupteur « Sons » (effets) pour les réglages. */
export const useSoundEnabled = () => useFlag(() => sfxEnabled, setSoundEnabled, sfxListeners);
/** Interrupteur « Musique » pour les réglages. */
export const useMusicEnabled = () => useFlag(() => musicEnabled, setMusicEnabled, musicListeners);
