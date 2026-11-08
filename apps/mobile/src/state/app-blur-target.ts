import { createRef, type ComponentRef } from 'react';
import { View } from 'react-native';

/** Vue native de l'application que les fenêtres de jeu peuvent flouter derrière leur contenu. */
export const appBlurTarget = createRef<ComponentRef<typeof View>>();
