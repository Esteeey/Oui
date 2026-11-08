import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

const OverlayContext = createContext<(overlay: ReactNode) => void>(() => {});

/** Affiche les fenêtres au-dessus des écrans dans la même fenêtre native, pour permettre le vrai flou d’arrière-plan. */
export function OverlayPortalProvider({ children }: { children: ReactNode }) {
  const [overlay, setOverlay] = useState<ReactNode>(null);
  const showOverlay = useCallback((next: ReactNode) => setOverlay(() => next), []);

  return (
    <OverlayContext.Provider value={showOverlay}>
      <View style={{ flex: 1 }}>
        {children}
        {overlay}
      </View>
    </OverlayContext.Provider>
  );
}

/** Déplace son contenu au niveau racine de l’application sans réinitialiser son état React. */
export function OverlayPortal({ children }: { children: ReactNode }) {
  const showOverlay = useContext(OverlayContext);
  useEffect(() => {
    showOverlay(children);
  }, [children, showOverlay]);
  useEffect(() => () => showOverlay(null), [showOverlay]);
  return null;
}
