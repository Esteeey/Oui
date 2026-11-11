// `@expo/metro-runtime` doit rester le premier import (Fast Refresh sur le web).
import '@expo/metro-runtime';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createElement, useEffect, useState } from 'react';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';

import { APP_THEME_KEY, applyAppTheme } from './src/constants/theme';

/**
 * Lit la palette choisie (réglage admin) AVANT de charger les écrans : leurs styles lisent les couleurs au chargement.
 * Le reste de l'app n'est chargé qu'ensuite, d'où le `require` différé.
 */
function Boot() {
  const [App, setApp] = useState(null);
  useEffect(() => {
    AsyncStorage.getItem(APP_THEME_KEY)
      .catch(() => null)
      .then((value) => {
        applyAppTheme(value);
        setApp(() => require('expo-router/build/qualified-entry').App);
      });
  }, []);
  return App ? createElement(App) : null;
}

renderRootComponent(Boot);
