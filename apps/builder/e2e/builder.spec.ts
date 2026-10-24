/**
 * Le Builder dans un vrai Chromium, sur le site construit (CSP de l'atelier
 * comprise) :
 *  · le parcours sans code complet — nouveau, données, vue, essai, fiche,
 *    publier — jusqu'au paquet téléchargé, que `filarr-ext verify` accepte ;
 *  · « Ouvrir dans Filarr » vers un faux Filarr local : le paquet n'est remis
 *    qu'après « ready », et seulement à cette origine ;
 *  · un projet avec code (esbuild-wasm sous la CSP), monté dans la page bac à
 *    sable, empaqueté et vérifié ;
 *  · aucune requête hors de l'origine du Builder, aucune violation de CSP.
 */

import { expect, test, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SAMPLE = join(REPO, 'examples', 'nocode', 'carnet-recettes', 'exemples', 'tarte-aux-pommes.recette');
const SHOT = join(REPO, 'examples', 'code', 'planche-photos', 'exemples', 'photos', 'phare.png');
const JPEG = join(REPO, 'examples', 'code', 'planche-photos', 'exemples', 'photos', 'galet.jpg');
const FAKE_FILARR_PORT = 4181;
const OUT = mkdtempSync(join(tmpdir(), 'filarr-builder-e2e-'));

/** La relecture de `filarr-ext verify`, l'outil du terminal, sur le paquet téléchargé. */
function verify(path: string): { status: number | null; out: string } {
  const r = spawnSync(process.execPath, [join(REPO, 'packages', 'cli', 'bin', 'filarr-ext.mjs'), 'verify', path], { encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** Ce qui ne doit jamais arriver : une requête ailleurs, une violation de CSP, une erreur de page. */
function watch(page: Page, origin: string) {
  const foreign: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('blob:') && !u.startsWith('data:')) foreign.push(u);
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // La page bac à sable de Filarr garde « webrtc 'block' », que Chromium ne connaît pas : attendu.
    if (m.type() === 'error' && !/directive 'webrtc'/.test(m.text())) errors.push(m.text());
  });
  return { foreign, errors };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
});

test('servi avec la CSP de l’atelier, et la page bac à sable avec la sienne', async ({ page, request, baseURL }) => {
  const res = await page.goto('/');
  const csp = res?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  // Pas d'`unsafe-eval` dans l'atelier : seul `wasm-unsafe-eval`, pour esbuild-wasm.
  expect(csp).not.toMatch(/(^|[ ;])'unsafe-eval'/);
  expect(csp).toContain("frame-ancestors 'none'");
  const sandbox = await request.get(`${baseURL}/plugin-sandbox.html`);
  expect(sandbox.headers()['content-security-policy']).toMatch(/^default-src 'none'; script-src 'sha256-/);
  // Identique, octet pour octet, à la copie vendorisée de Filarr.
  expect(Buffer.from(await sandbox.body()).equals(readFileSync(join(REPO, 'packages', 'devhost', 'vendor', 'plugin-sandbox.html')))).toBe(true);
});

test('parcours sans code complet, jusqu’au paquet accepté par filarr-ext verify, puis remis à Filarr', async ({ page, baseURL }) => {
  const origin = new URL(baseURL as string).origin;
  const w = watch(page, origin);

  // Un faux Filarr local : il dit « prêt » à la fenêtre qui l'a ouvert, puis note ce qu'il reçoit.
  const fake: Server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><title>attente</title><script>
      addEventListener('message', (ev) => {
        if (ev.data && ev.data.type === 'filarr-publish-package') document.title = 'recu|' + ev.origin + '|' + ev.data.version + '|' + (ev.data.bytes instanceof ArrayBuffer) + '|' + ev.data.bytes.byteLength;
      });
      if (window.opener && location.search === '?filarr-publish=builder') window.opener.postMessage({ type: 'filarr-publish-ready', version: 1 }, ${JSON.stringify(origin)});
    </script>`);
  });
  await new Promise<void>((ok) => fake.listen(FAKE_FILARR_PORT, ok));

  try {
    // ── Nouvelle extension ──────────────────────────────────────────────
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Nouvelle extension' })).toBeVisible();
    await page.getByLabel('Nom', { exact: true }).fill('Carnet de recettes essai');
    await expect(page.locator('#n-id')).toHaveValue('carnet-de-recettes-essai');
    await page.locator('#n-ext').fill('.recette');
    await page.locator('#n-ext').press('Enter');
    await expect(page.getByRole('button', { name: 'Retirer .recette' })).toBeVisible();
    await page.getByRole('button', { name: 'Créer le projet' }).click();
    await page.waitForURL(/#\/p\/[a-z0-9]+\/donnees$/);

    // ── Données : un exemple, des champs devinés, une correction ────────
    await page.getByTestId('sample-input').setInputFiles(SAMPLE);
    await expect(page.getByText('Champs trouvés dans l’exemple')).toBeVisible();
    await expect(page.getByLabel('Type de portions', { exact: true })).toHaveValue('number');
    await expect(page.getByLabel('Type de ingredients', { exact: true })).toHaveValue('list');
    await expect(page.getByLabel('Type de ingredients[].pris', { exact: true })).toHaveValue('boolean');
    await page.getByLabel('Libellé de categorie', { exact: true }).fill('Catégorie');
    await page.getByLabel('Type de categorie', { exact: true }).selectOption('choice');
    await page.locator('tr', { hasText: 'titre' }).first().getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Suivant : la vue' }).click();
    await page.waitForURL(/\/vue$/);

    // ── Vue : le VRAI moteur dans la page bac à sable ───────────────────
    const preview = page.frameLocator('.preview-frame iframe');
    await expect(preview.locator('.nc-root').first()).toBeVisible();
    await expect(preview.getByText('Ingredients').first()).toBeVisible();
    await page.getByRole('button', { name: /^Total calculé$/ }).click();
    await expect(page.locator('.blk-tag', { hasText: 'Total calculé' })).toBeVisible();
    await page.getByRole('button', { name: 'Ambre' }).click();
    await page.getByRole('button', { name: 'Voir le code généré' }).click();
    await expect(page.getByText('globalThis.__filarrNocodeBoot(', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Fermer' }).click();
    await page.getByRole('button', { name: 'Suivant : l’essai' }).click();
    await page.waitForURL(/\/essai$/);

    // ── Essai : simulateur, lecture seule, contrôles ────────────────────
    await expect(page.frameLocator('.sim-stage iframe').locator('.nc-root').first()).toBeVisible();
    await expect(page.locator('.checks')).toContainText('relu comme Filarr le relira');
    await page.getByRole('button', { name: 'Lecture seule' }).click();
    await expect(page.locator('.sim-log')).toContainText('readOnly');
    await page.getByRole('button', { name: 'Lecture seule' }).click();

    // ── Fiche ───────────────────────────────────────────────────────────
    await page.locator('.steps-rail a', { hasText: 'Fiche' }).click();
    await page.waitForURL(/\/fiche$/);
    await page.getByRole('button', { name: /Choisir une icône/ }).click();
    await page.getByRole('button', { name: '🍲' }).click();
    await page.getByLabel('Description').fill('Vos recettes en fiches : portions, ingrédients à cocher, étapes.');
    await page.getByLabel('Nom publié').fill('Camille R.');
    await page.getByLabel('Catégorie').selectOption('productivity');
    await page.getByTestId('shot-input').setInputFiles(JPEG);
    await expect(page.getByText('JPEG refusé', { exact: false }).first()).toBeVisible();
    await page.getByTestId('shot-input').setInputFiles(SHOT);
    await expect(page.locator('.shot img')).toHaveCount(1);
    await expect(page.locator('.shot-meta').first()).toContainText('WEBP');
    await page.getByLabel('Code source').fill('https://exemple.org/carnet');
    await page.getByLabel('Licence', { exact: true }).selectOption('MIT');
    await expect(page.locator('.market-card').first()).toContainText('Camille R.');

    // ── Publier : le paquet, puis la remise à Filarr ────────────────────
    await page.locator('.steps-inline a', { hasText: 'Publier' }).click();
    await page.waitForURL(/\/publier$/);
    const dl = page.getByRole('button', { name: 'Télécharger .filarrext' });
    await expect(dl).toBeEnabled({ timeout: 60_000 });
    const [download] = await Promise.all([page.waitForEvent('download'), dl.click()]);
    expect(download.suggestedFilename()).toBe('carnet-de-recettes-essai-0.1.0.filarrext');
    const file = join(OUT, download.suggestedFilename());
    await download.saveAs(file);
    const v = verify(file);
    expect(v.out).toContain('0 erreur(s)');
    expect(v.status).toBe(0);

    await page.locator('details.dev summary').click();
    await page.locator('#p-origin').fill(`http://localhost:${FAKE_FILARR_PORT}`);
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Ouvrir dans Filarr' }).click()]);
    await expect(popup).toHaveURL(`http://localhost:${FAKE_FILARR_PORT}/?filarr-publish=builder`);
    await expect.poll(() => popup.title(), { timeout: 30_000 }).toMatch(/^recu\|/);
    const [, from, version, isBuffer, size] = (await popup.title()).split('|');
    expect(from).toBe(origin);
    expect(version).toBe('1');
    expect(isBuffer).toBe('true');
    expect(Number(size)).toBe(statSync(file).size);
    await expect(page.getByText('Paquet remis à Filarr', { exact: false })).toBeVisible();

    expect(w.foreign).toEqual([]);
    expect(w.errors).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
  } finally {
    await new Promise((ok) => fake.close(ok));
  }
});

test('projet avec code : esbuild-wasm sous la CSP, monté dans la page bac à sable, paquet vérifié', async ({ page, baseURL }) => {
  const origin = new URL(baseURL as string).origin;
  const w = watch(page, origin);
  await page.goto('/');
  await page.getByRole('button', { name: /Avec du code/ }).click();
  await page.locator('.tile', { hasText: 'Traces GPX' }).click();
  await expect(page.locator('#n-id')).toHaveValue('traces-gpx');
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  await page.waitForURL(/\/essai$/);
  // La construction (esbuild-wasm, ?worker compris) puis le montage réel.
  await expect(page.locator('.checks')).toContainText('build esbuild : IIFE, ES2020, ASCII', { timeout: 90_000 });
  await expect(page.locator('.checks')).toContainText('monté dans la page bac à sable de Filarr', { timeout: 60_000 });
  await expect(page.locator('.sim-log')).toContainText('monté');
  // Une modification reconstruit et recharge le simulateur.
  await page.getByRole('button', { name: 'Simuler un conflit' }).click();
  await expect(page.getByText('Conflit simulé', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Publier…' }).click();
  await page.waitForURL(/\/publier$/);
  const dl = page.getByRole('button', { name: 'Télécharger .filarrext' });
  await expect(dl).toBeEnabled({ timeout: 90_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), dl.click()]);
  const file = join(OUT, download.suggestedFilename());
  await download.saveAs(file);
  const v = verify(file);
  expect(v.out).toContain('0 erreur(s)');
  expect(v.status).toBe(0);
  expect(w.foreign).toEqual([]);
  expect(w.errors).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
});

test('utilisable en largeur étroite et au clavier', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  // Au clavier : le lien d'évitement, puis les commandes, sans souris.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Aller au contenu' })).toBeFocused();
  await page.getByLabel('Nom', { exact: true }).focus();
  await page.keyboard.type('Liste clavier');
  await page.locator('#n-ext').focus();
  await page.keyboard.type('liste,');
  await expect(page.getByRole('button', { name: 'Retirer .liste' })).toBeVisible();
  await page.getByRole('button', { name: 'Créer le projet' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/donnees$/);
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow2).toBeLessThanOrEqual(1);
  // Anglais disponible.
  await page.getByLabel('Langue').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Your file' })).toBeVisible();
});
