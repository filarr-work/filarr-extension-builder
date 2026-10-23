/**
 * Planche photos — composer une planche à partir d'images CHOISIES dans Filarr
 * (capacité `picker`, accès `read`).
 *
 * Ce que l'exemple montre : l'extension ne choisit jamais ce qu'elle voit.
 * « Ajouter des photos… » appelle `host.pick({ multiple: true })` : Filarr
 * ouvre SON sélecteur (limité aux extensions déclarées), l'utilisateur choisit,
 * et l'extension reçoit des POIGNÉES opaques — jamais un identifiant de
 * fichier, un dossier ou un chemin. `host.readPicked(poignée)` en lit les
 * octets. Les poignées ne valent que pour la session : la planche garde donc
 * une copie RÉDUITE de chaque image, et se rouvre sans les originaux.
 */

import { creerEcouteurs, el, estRaccourciEnregistrer, feuille } from './dom';
import { creerBarreEtat } from './etat';
import { TEXTES, langueDe } from './i18n';
import { typeImage } from './images';
import { COLONNES, LEGENDE_MAX, PHOTOS_MAX, TITRE_MAX, deplacer, ecrirePlanche, lirePlanche, nouvelId, type Photo, type Planche } from './planche';
import { reduire } from './reduction';
import { codeDeRejet, creerSauvegarde } from './sauvegarde';
import { CSS } from './style';

export const EDITOR_ID = 'planche-photos-editor';
/** La vignette embarquée tient dans 480 × 480 ; « Relire l'original » la refait en 1 200. */
const VIGNETTE_MAX = 480;
const RELECTURE_MAX = 1200;

function mount(host: FilarrHost): FilarrEditorInstance {
  const langue = langueDe(host.locale);
  const t = TEXTES[langue];
  const ecoute = creerEcouteurs();
  host.container.textContent = '';
  const style = feuille(CSS);
  const racine = el('div', { classe: 'pp', attrs: { lang: langue, 'data-schema': host.theme.scheme } });
  host.container.append(style, racine);
  const desabonnerTheme = host.onThemeChange((theme) => {
    racine.dataset.schema = theme.scheme;
  });

  const lu = lirePlanche(host.initialBytes);
  if (!lu.ok) {
    const message = typeof lu.raison === 'object' ? t.versionInconnue(lu.raison.version) : t.illisible;
    racine.append(el('div', { classe: 'etat-alerte', attrs: { role: 'alert' }, texte: message }));
    const original = host.initialBytes.slice();
    return {
      destroy() {
        desabonnerTheme();
        racine.remove();
        style.remove();
      },
      getBytes: () => original.slice(),
    };
  }

  let planche: Planche = lu.planche;
  let detruit = false;
  /** Les poignées de CETTE session, par photo. Jamais écrites : elles ne vaudraient rien demain. */
  const poignees = new Map<string, { handle: string; nom: string }>();

  const barre = creerBarreEtat(t, langue, host.readOnly);
  const sauvegarde = creerSauvegarde({
    lectureSeule: host.readOnly,
    enregistrer: () => host.saveBytes(ecrirePlanche(planche)),
    signalerSale: (sale) => host.onDirty(sale),
    surEtat: barre.afficher,
  });

  const titre = el('input', { classe: 'pp-titre', attrs: { type: 'text', 'aria-label': t.titre, placeholder: t.titrePlaceholder, maxlength: TITRE_MAX } });
  titre.value = planche.titre;
  titre.readOnly = host.readOnly;
  const colonnes = el('select', { classe: 'pp-colonnes', attrs: { 'aria-label': t.colonnes } });
  for (const n of COLONNES) colonnes.append(el('option', { texte: String(n), attrs: { value: n } }));
  colonnes.value = String(planche.colonnes);
  colonnes.disabled = host.readOnly;
  const ajouter = el('button', { classe: 'pp-bouton pp-principal', texte: t.ajouter, attrs: { type: 'button', 'data-action': 'ajouter' } });
  // Sans la capacité, `host.pick` n'existe pas : le bouton le dit plutôt que d'échouer.
  ajouter.disabled = host.readOnly || !host.pick || !host.readPicked;
  const nouvelles = el('p', { classe: 'pp-nouvelles', attrs: { role: 'status' } });
  const grille = el('ul', { classe: 'pp-grille', attrs: { 'aria-label': t.photos } });
  const vide = el('p', { classe: 'pp-vide', texte: t.vide });

  racine.append(
    el('div', { classe: 'pp-outils' }, [titre, el('label', { classe: 'pp-groupe' }, [el('span', { texte: t.colonnes }), colonnes]), ajouter, barre.statut]),
    barre.alerte
  );
  if (lu.repare) racine.append(el('p', { classe: 'pp-info', texte: t.repare }));
  if (!host.pick && !host.readOnly) nouvelles.textContent = t.sansSelecteur;
  racine.append(el('div', { classe: 'pp-zone' }, [nouvelles, vide, grille, el('p', { classe: 'pp-note', texte: t.session })]));

  const muter = (suivante: Planche, redessiner = true) => {
    if (host.readOnly) return;
    planche = suivante;
    if (redessiner) dessiner();
    sauvegarde.modifie();
  };

  function dessiner(focus?: { id: string; quoi: 'avant' | 'apres' | 'legende' }): void {
    grille.textContent = '';
    grille.style.setProperty('--colonnes', String(planche.colonnes));
    vide.hidden = planche.photos.length > 0;
    planche.photos.forEach((p, i) => {
      const nom = p.nom || `#${i + 1}`;
      // La data URL a été vérifiée à la lecture (type annoncé = type des octets).
      const img = el('img', { classe: 'pp-image', attrs: { src: p.image, alt: p.legende || nom, width: p.largeur, height: p.hauteur, decoding: 'async' } });
      const legende = el('textarea', { classe: 'pp-legende', attrs: { rows: 2, 'aria-label': t.legende(nom), maxlength: LEGENDE_MAX } });
      legende.value = p.legende;
      legende.readOnly = host.readOnly;
      legende.addEventListener('input', () => {
        img.alt = legende.value || nom;
        muter({ ...planche, photos: planche.photos.map((x) => (x.id === p.id ? { ...x, legende: legende.value.slice(0, LEGENDE_MAX) } : x)) }, false);
      });
      const bouton = (texte: string, etiquette: string, action: string, actif: boolean, fn: () => void) => {
        const b = el('button', { classe: 'pp-mini', texte, attrs: { type: 'button', 'aria-label': etiquette, title: etiquette, 'data-action': action } });
        b.disabled = host.readOnly || !actif;
        b.addEventListener('click', fn);
        return b;
      };
      const avant = bouton('←', t.avant(nom), 'avant', i > 0, () => {
        muter({ ...planche, photos: deplacer(planche.photos, i, -1) }, false);
        dessiner({ id: p.id, quoi: 'avant' });
      });
      const apres = bouton('→', t.apres(nom), 'apres', i < planche.photos.length - 1, () => {
        muter({ ...planche, photos: deplacer(planche.photos, i, 1) }, false);
        dessiner({ id: p.id, quoi: 'apres' });
      });
      const retirer = bouton('×', t.retirer(nom), 'retirer', true, () => {
        poignees.delete(p.id);
        muter({ ...planche, photos: planche.photos.filter((x) => x.id !== p.id) });
      });
      const actions = el('div', { classe: 'pp-actions' }, [avant, apres, retirer]);
      const poignee = poignees.get(p.id);
      if (poignee && !host.readOnly) {
        actions.append(bouton(t.relire, t.relire, 'relire', true, () => void relire(p.id)));
      }
      const li = el('li', { classe: 'pp-photo', attrs: { 'data-id': p.id } }, [
        el('figure', {}, [img, el('figcaption', {}, [legende])]),
        actions,
      ]);
      // Alt+← / Alt+→ depuis la légende : déplacer sans quitter le clavier.
      li.addEventListener('keydown', (e) => {
        if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
        e.preventDefault();
        (e.key === 'ArrowLeft' ? avant : apres).click();
        grille.querySelector<HTMLTextAreaElement>(`[data-id="${p.id}"] .pp-legende`)?.focus();
      });
      grille.append(li);
      if (focus?.id === p.id) {
        const cible = focus.quoi === 'legende' ? legende : focus.quoi === 'avant' ? (avant.disabled ? apres : avant) : apres.disabled ? avant : apres;
        cible.focus();
      }
    });
  }

  async function relire(id: string): Promise<void> {
    const p = poignees.get(id);
    if (!p || !host.readPicked) return;
    try {
      const octets = await host.readPicked(p.handle);
      const type = typeImage(octets);
      if (!type) throw new Error('pas_une_image');
      const v = await reduire(octets, type, RELECTURE_MAX);
      if (detruit) return;
      muter({ ...planche, photos: planche.photos.map((x) => (x.id === id ? { ...x, ...v } : x)) });
      nouvelles.textContent = t.relue;
    } catch (e) {
      if (detruit) return;
      const code = codeDeRejet(e);
      if (code === 'unknown_handle') {
        poignees.delete(id);
        dessiner();
      }
      nouvelles.textContent = (t.refus[code] ?? ((n: string) => `${n} (${code})`))(p.nom);
    }
  }

  ecoute.sur(ajouter, 'click', async () => {
    if (host.readOnly || !host.pick || !host.readPicked) return;
    if (planche.photos.length >= PHOTOS_MAX) {
      nouvelles.textContent = t.plein;
      return;
    }
    let choisis: FilarrPicked[];
    ajouter.disabled = true;
    try {
      choisis = await host.pick({ multiple: true });
    } catch (e) {
      if (detruit) return;
      ajouter.disabled = false;
      const code = codeDeRejet(e);
      nouvelles.textContent = code === 'busy' ? t.refus.busy('') : t.echecSelecteur(code);
      return;
    }
    if (detruit) return;
    // Annuler le sélecteur rend une liste vide : rien à faire, rien à dire.
    if (choisis.length === 0) {
      ajouter.disabled = false;
      return;
    }
    nouvelles.textContent = t.lecture(choisis.length);
    const ajouts: Photo[] = [];
    const refus: string[] = [];
    const pris = new Set(planche.photos.map((x) => x.id));
    // Une image à la fois : la mémoire de la page et le débit du pont s'en portent mieux.
    for (const f of choisis.slice(0, PHOTOS_MAX - planche.photos.length)) {
      try {
        const octets = await host.readPicked(f.handle);
        const type = typeImage(octets);
        if (!type) throw new Error('pas_une_image');
        const v = await reduire(octets, type, VIGNETTE_MAX);
        const id = nouvelId(pris);
        pris.add(id);
        ajouts.push({ id, nom: f.name.slice(0, 200), legende: '', ...v });
        poignees.set(id, { handle: f.handle, nom: f.name });
      } catch (e) {
        const code = codeDeRejet(e);
        refus.push((t.refus[code] ?? ((n: string) => `« ${n} » (${code})`))(f.name));
      }
      if (detruit) return;
    }
    ajouter.disabled = false;
    if (ajouts.length) muter({ ...planche, photos: [...planche.photos, ...ajouts] });
    nouvelles.textContent = [ajouts.length ? t.ajoutees(ajouts.length) : '', ...refus].filter(Boolean).join(' ');
  });
  ecoute.sur(titre, 'input', () => muter({ ...planche, titre: titre.value.slice(0, TITRE_MAX) }, false));
  ecoute.sur(colonnes, 'change', () => muter({ ...planche, colonnes: Number(colonnes.value) || 3 }));
  ecoute.sur(racine, 'keydown', (e) => {
    if (!estRaccourciEnregistrer(e as KeyboardEvent)) return;
    e.preventDefault();
    if (!host.readOnly) sauvegarde.maintenant();
  });

  dessiner();

  return {
    destroy() {
      detruit = true;
      poignees.clear();
      sauvegarde.detruire();
      desabonnerTheme();
      ecoute.tout();
      racine.remove();
      style.remove();
    },
    getBytes: () => ecrirePlanche(planche),
  };
}

const ids = [EDITOR_ID];
for (let i = 1; i <= 8; i++) ids.push(`dev-local-${i}-editor`);

globalThis.filarrSandboxedPlugin = { editors: ids.map((id) => ({ id, mount })) };
