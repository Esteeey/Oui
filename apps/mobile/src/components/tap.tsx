import { useState } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Élément touchable avec un retour visuel immédiat : il s'enfonce dès que le doigt se pose
 * (et non au relâchement), puis rebondit en reprenant sa taille quand on le lâche.
 * À utiliser à la place de `Pressable` pour tout ce qu'on peut toucher.
 */
export function Tap({ style, disabled, onPressIn, onPressOut, ...props }: PressableProps) {
  const interactive = !disabled && !!(props.onPress || props.onLongPress || onPressIn);
  const [down, setDown] = useState(false);
  const press = useSharedValue(0);
  const pressed = useAnimatedStyle(() => ({
    opacity: 1 - press.value * 0.15,
    transform: [{ scale: 1 - press.value * 0.06 }, { translateY: press.value * 2 }],
  }));
  return (
    <AnimatedPressable
      disabled={disabled}
      {...props}
      onPressIn={(e: GestureResponderEvent) => {
        setDown(true);
        if (interactive) press.value = withTiming(1, { duration: 80 });
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        setDown(false);
        press.value = withSpring(0, { damping: 9, stiffness: 280 });
        onPressOut?.(e);
      }}
      style={[typeof style === 'function' ? style({ pressed: down, hovered: false }) : style, pressed]}
    />
  );
}
