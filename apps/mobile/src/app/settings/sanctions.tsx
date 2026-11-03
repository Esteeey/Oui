import { BackButton } from '@/components/back-button';
import { SanctionsList } from '@/components/sanctions';
import { AppText, Screen } from '@/components/ui';

/** Mes sanctions : avertissements, suspensions, bannissement, et leurs appels. */
export default function SanctionsScreen() {
  return (
    <Screen>
      <BackButton />
      <AppText variant="title">Mes sanctions</AppText>
      <SanctionsList />
    </Screen>
  );
}
