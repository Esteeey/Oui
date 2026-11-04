import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useEffect, useState } from 'react';

/**
 * Sons et musiques de Qu1z : tous originaux, synthétisés pour l'appli (scripts de génération hors dépôt).
 * Effets : un lecteur préchargé par son, rembobiné à chaque lecture.
 * Musiques : une seule à la fois (musique de duel en boucle, ou musique de résultat).
 */
const SFX = {
  launch: require('../../assets/sounds/qz_lancement.wav'),
  versus: require('../../assets/sounds/s10_vs.wav'),
  question: require('../../assets/sounds/qz_question.wav'),
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
  xpEnd: require('../../assets/sounds/qz_xp_fin.wav'),
  levelUp: require('../../assets/sounds/qz_niveau.wav'),
} as const;

const MUSIC = {
  duel: require('../../assets/sounds/qz_musique_duel.mp3'),
  win: require('../../assets/sounds/qz_musique_victoire.mp3'),
  loss: require('../../assets/sounds/qz_musique_defaite.mp3'),
  draw: require('../../assets/sounds/qz_musique_egalite.mp3'),
} as const;

export type SoundName = keyof typeof SFX;
export type MusicName = keyof typeof MUSIC;

/** Dans le fichier de l'intro VS, le choc tombe 250 ms après le début : on le lance d'autant en avance. */
export const VERSUS_HIT_OFFSET_MS = 250;
/** Le tic-tac dure 5 s : il démarre quand il reste 5 s pour répondre. */
export const TICK_WINDOW_MS = 5000;
/** Durée du son de montée d'XP. */
export const XP_SOUND_MS = 1650;

const MUSIC_VOLUME: Record<MusicName, number> = { duel: 0.35, win: 0.6, loss: 0.6, draw: 0.6 };

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
  for (const [name, source] of Object.entries(SFX) as [SoundName, number][]) {
    try {
      players.set(name, createAudioPlayer(source));
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

/** Précharge les effets, par exemple à l'ouverture de l'écran de duel. */
export function preloadSounds() {
  if (sfxEnabled) prepare();
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
let current: MusicName | null = null;
const fades = new Map<AudioPlayer, ReturnType<typeof setInterval>>();

function musicPlayer(name: MusicName): AudioPlayer | null {
  let player = musicPlayers.get(name);
  if (!player) {
    try {
      prepare();
      player = createAudioPlayer(MUSIC[name]);
      player.loop = name === 'duel';
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

/** Lance une musique depuis le début, en arrêtant (en fondu) celle qui jouait. */
export function playMusic(name: MusicName) {
  if (current && current !== name) fadeOut(current, 500);
  current = name;
  if (!musicEnabled) return;
  const player = musicPlayer(name);
  if (!player) return;
  try {
    player.volume = name === 'duel' ? 0 : MUSIC_VOLUME[name];
    player.seekTo(0).catch(() => {});
    player.play();
    if (name === 'duel') fadeTo(player, MUSIC_VOLUME.duel, 800);
  } catch {}
}

/** Arrête la musique en cours (en fondu). Sans nom, arrête celle qui joue ; avec un nom, seulement si c'est elle. */
export function stopMusic(name?: MusicName, ms = 700) {
  if (!current || (name && name !== current)) return;
  const playing = current;
  current = null;
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
  } else if (current === 'duel') {
    playMusic('duel'); // les musiques de résultat, courtes, ne sont pas relancées
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
