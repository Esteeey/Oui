import { SanctionsList } from '@/components/sanctions';
import { AppText, Screen } from '@/components/ui';

/** Mes sanctions : avertissements, suspensions, bannissement, et leurs appels. */
export default function SanctionsScreen() {
  return (
    <Screen title="Mes sanctions" back>
      <SanctionsList />
    </Screen>
  );
}
