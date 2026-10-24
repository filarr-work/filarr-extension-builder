import { lazy, Suspense } from 'react';
import { TopBar } from './components/chrome';
import { NewExtension } from './screens/NewExtension';
import { usePrefs } from './state/prefs';
import { ProjectProvider, useProject } from './state/project';
import { useRoute, type Screen } from './state/router';

// Chaque écran de projet se charge à la demande : l'accueil reste léger.
const DataScreen = lazy(() => import('./screens/Data').then((m) => ({ default: m.DataScreen })));
const ViewScreen = lazy(() => import('./screens/View').then((m) => ({ default: m.ViewScreen })));
const Workshop = lazy(() => import('./screens/Workshop').then((m) => ({ default: m.Workshop })));
const ListingScreen = lazy(() => import('./screens/Listing').then((m) => ({ default: m.ListingScreen })));
const PublishScreen = lazy(() => import('./screens/Publish').then((m) => ({ default: m.PublishScreen })));
const ModelScreen = lazy(() => import('./screens/Model').then((m) => ({ default: m.ModelScreen })));

function Waiting({ text }: { text: string }) {
  return (
    <div className="app">
      <TopBar />
      <main className="page">
        <p className="lead" role="status">{text}</p>
      </main>
    </div>
  );
}

function ProjectScreens({ screen }: { screen: Screen }) {
  const { mode } = useProject();
  // Un écran qui n'existe pas dans ce mode renvoie vers son équivalent.
  const s: Screen = mode === 'code' && (screen === 'donnees' || screen === 'vue') ? 'essai' : mode === 'nocode' && screen === 'modele' ? 'donnees' : screen;
  switch (s) {
    case 'donnees':
      return <DataScreen />;
    case 'vue':
      return <ViewScreen />;
    case 'fiche':
      return <ListingScreen />;
    case 'publier':
      return <PublishScreen />;
    case 'modele':
      return <ModelScreen />;
    default:
      return <Workshop />;
  }
}

export function App() {
  const route = useRoute();
  const { tr } = usePrefs();
  if (route.name === 'home') return <NewExtension />;
  return (
    <ProjectProvider
      key={route.key}
      storeKey={route.key}
      fallback={(state) =>
        state === 'loading' ? (
          <Waiting text={tr('Ouverture du projet…', 'Opening the project…')} />
        ) : (
          <div className="app">
            <TopBar />
            <main className="page">
              <h1>{tr('Projet introuvable', 'Project not found')}</h1>
              <p className="lead">{tr('Ce projet n’est pas enregistré dans ce navigateur. Les projets restent sur l’appareil où ils ont été créés, sauf si vous les exportez.', 'This project is not saved in this browser. Projects stay on the device where they were created, unless you export them.')}</p>
              <p><a href="#/">{tr('Revenir à l’accueil', 'Back to home')}</a></p>
            </main>
          </div>
        )
      }
    >
      <Suspense fallback={<Waiting text={tr('Chargement…', 'Loading…')} />}>
        <ProjectScreens screen={route.screen} />
      </Suspense>
    </ProjectProvider>
  );
}
