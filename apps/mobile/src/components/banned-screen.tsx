import { Logo } from '@/components/header';
import { SanctionsList } from '@/components/sanctions';
import { AppText, Screen } from '@/components/ui';
import { Colors } from '@/constants/theme';

/** Compte banni : l'accès à l'application est interdit, mais le joueur peut consulter la sanction et faire appel. */
export function BannedScreen() {
  return (
    <Screen title="Compte suspendu" headerLeft={<Logo />}>
      <AppText variant="title" color={Colors.wrong}>
        Compte banni
      </AppText>
      <AppText muted>
        Ton compte a été banni par l’équipe de modération. Tu ne peux plus utiliser Qu1z avec ce compte. Si tu penses que c’est une erreur, tu peux
        contester la décision ci-dessous : ton appel sera examiné et la réponse s’affichera ici.
      </AppText>
      <SanctionsList />
    </Screen>
  );
}
