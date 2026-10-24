import { ProjectHeader } from '../components/ProjectHeader';

export function ViewScreen() {
  return (
    <div className="app">
      <ProjectHeader screen="vue" />
      <main className="page" />
    </div>
  );
}
