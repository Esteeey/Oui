import { Pressable, type PressableProps } from 'react-native';

/**
 * Élément touchable avec un retour visuel immédiat : il s'atténue dès que le doigt se pose
 * (et non au relâchement), puis reprend son aspect s'il glisse hors de la cible.
 * À utiliser à la place de `Pressable` pour tout ce qu'on peut toucher.
 */
export function Tap({ style, disabled, ...props }: PressableProps) {
  const interactive = !disabled && !!(props.onPress || props.onLongPress || props.onPressIn);
  return (
    <Pressable
      disabled={disabled}
      {...props}
      style={(state) => [typeof style === 'function' ? style(state) : style, interactive && state.pressed && { opacity: 0.6 }]}
    />
  );
}
