import { DuelHistoryList } from '@/components/duel-history-list';
import { Screen } from '@/components/ui';
import { useProgress } from '@/state/progress';

/** Historique complet des duels et des défis, ouvert depuis « Tout voir » sur la page des thèmes. */
export default function DuelsScreen() {
  const { history } = useProgress();
  return (
    <Screen title="Historique de duel" back>
      <DuelHistoryList duels={history} />
    </Screen>
  );
}
