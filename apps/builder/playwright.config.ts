import { defineConfig, devices } from '@playwright/test';

/**
 * Le parcours dans un vrai Chromium, sur le site CONSTRUIT (`vite preview`) :
 * c'est lui qui porte la CSP stricte de l'atelier et les en-têtes de la page
 * bac à sable, tels qu'ils seront déployés. Lancer `npm run build` d'abord.
 *
 * BUILDER_E2E_PORT change le port : Windows réserve parfois toute une plage
 * (4148-4247 un jour, `netsh interface ipv4 show excludedportrange protocol=tcp`)
 * et l'écoute échoue alors en EACCES.
 */
const PORT = Number(process.env.BUILDER_E2E_PORT ?? 4173);
export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
