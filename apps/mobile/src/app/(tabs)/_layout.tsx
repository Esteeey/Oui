import { Tabs } from 'expo-router';

import { AppNavBar } from '@/components/app-nav-bar';

/** Les cinq destinations principales restent de vraies routes Expo Router ; la barre dessinée est `AppNavBar`. */
const TABS = [
  { name: 'index', title: 'Accueil' },
  { name: 'explore', title: 'Thèmes' },
  { name: 'play', title: 'VS' },
  { name: 'activity', title: 'Notifications' },
  { name: 'profile', title: 'Profil' },
];
/** Ces écrans gardent leurs routes et leurs liens, mais n'occupent pas un des cinq boutons principaux. */
const HIDDEN = ['people', 'leaderboard', 'search'];

export default function TabsLayout() {
  return (
    <Tabs tabBar={() => <AppNavBar />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}>
      {[...TABS, ...HIDDEN.map((name) => ({ name, title: name }))].map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
      ))}
    </Tabs>
  );
}
