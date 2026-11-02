import { router } from 'expo-router';
import type { TextStyle } from 'react-native';

import { AppText } from '@/components/ui';
import { Colors } from '@/constants/theme';

/** Texte d'une publication ou d'un commentaire : les @pseudo mentionnés ouvrent le profil. */
export function RichText({
  text,
  mentions,
  style,
}: {
  text: string;
  mentions: { id: string; pseudo: string }[];
  style?: TextStyle;
}) {
  const byPseudo = new Map(mentions.map((m) => [m.pseudo.toLowerCase(), m.id]));
  const parts = text.split(/(@[\p{L}\p{N}_.-]{3,20})/u);
  return (
    <AppText style={style}>
      {parts.map((part, i) => {
        const id = part.startsWith('@') ? byPseudo.get(part.slice(1).toLowerCase()) : undefined;
        return id ? (
          <AppText
            key={i}
            variant="label"
            color={Colors.opponent}
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/player/[id]', params: { id } })}>
            {part}
          </AppText>
        ) : (
          part
        );
      })}
    </AppText>
  );
}
