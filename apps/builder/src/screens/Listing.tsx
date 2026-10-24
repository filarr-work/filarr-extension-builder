import { ProjectHeader } from '../components/ProjectHeader';

export function ListingScreen() {
  return (
    <div className="app">
      <ProjectHeader screen="fiche" />
      <main className="page" />
    </div>
  );
}
