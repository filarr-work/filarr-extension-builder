/**
 * vue — la liste des sous-titres : début, fin, texte, une ligne par réplique.
 *
 * Les temps se valident à la VALIDATION du champ (`change` : Entrée ou sortie
 * du champ), pas à chaque frappe : « 00:01:0 » est un temps en cours de saisie,
 * pas une erreur. Un temps illisible reste affiché, marqué `aria-invalid`, et
 * le modèle garde l'ancien ; un problème de chronologie (fin avant début,
 * chevauchement) est signalé sous la ligne, jamais corrigé en silence.
 *
 * La liste est redessinée quand sa STRUCTURE change (insertion, suppression,
 * décalage) ; une frappe dans un texte ne redessine rien — le curseur reste où
 * il est.
 */

import { el } from './dom';
import type { Textes } from './i18n';
import { estTrie, probleme } from './operations';
import { ecrireTemps, lireTemps, type SousTitre } from './srt';

export interface RappelsVue {
  ajouter(apres: number): void;
  supprimer(i: number): void;
  temps(i: number, champ: 'debut' | 'fin', ms: number): void;
  texte(i: number, valeur: string): void;
  decaler(ms: number): void;
  trier(): void;
}

export interface Vue {
  outils: HTMLElement;
  zone: HTMLElement;
  dessiner(liste: SousTitre[]): void;
  verifier(liste: SousTitre[]): void;
  focaliser(i: number, champ: Champ): void;
  annoncer(texte: string): void;
}

type Champ = 'debut' | 'fin' | 'texte';

interface Ligne {
  debut: HTMLInputElement;
  fin: HTMLInputElement;
  texte: HTMLTextAreaElement;
  note: HTMLElement;
}

export function creerVue(o: { t: Textes; langue: string; lectureSeule: boolean; rappels: RappelsVue }): Vue {
  const { t, lectureSeule, rappels } = o;
  let lignes: Ligne[] = [];
  let nombre = 0;

  const ajouter = el('button', { classe: 'st-bouton st-principal', texte: t.ajouter, attrs: { type: 'button', 'data-action': 'ajouter' } });
  ajouter.disabled = lectureSeule;
  ajouter.addEventListener('click', () => rappels.ajouter(nombre - 1));
  const decalage = el('input', { classe: 'st-decalage', attrs: { type: 'number', step: 100, value: 0, 'aria-label': t.decalage } });
  decalage.readOnly = lectureSeule;
  const appliquer = el('button', { classe: 'st-bouton', texte: t.appliquerDecalage, attrs: { type: 'button', 'data-action': 'decaler' } });
  appliquer.disabled = lectureSeule;
  appliquer.addEventListener('click', () => {
    const ms = Number(decalage.value);
    if (Number.isFinite(ms) && ms !== 0) rappels.decaler(ms);
  });
  const trier = el('button', { classe: 'st-bouton', texte: t.trier, attrs: { type: 'button', 'data-action': 'trier' } });
  trier.addEventListener('click', () => rappels.trier());
  const resume = el('span', { classe: 'st-resume' });
  const outils = el('div', { classe: 'st-outils' }, [
    ajouter,
    el('label', { classe: 'st-groupe' }, [el('span', { texte: t.decalage }), decalage]),
    appliquer,
    trier,
    resume,
  ]);

  const desordre = el('p', { classe: 'st-desordre', texte: t.desordre });
  const vide = el('p', { classe: 'st-vide', texte: t.vide });
  const liste = el('ol', { classe: 'st-liste', attrs: { 'aria-label': t.liste, 'aria-describedby': 'st-aide' } });
  const aide = el('p', { classe: 'st-aide', texte: t.aide, attrs: { id: 'st-aide' } });
  const annonce = el('div', { classe: 'st-cache', attrs: { 'aria-live': 'polite' } });
  const zone = el('div', { classe: 'st-zone' }, [desordre, vide, liste, aide, annonce]);

  const duree = (ms: number) => {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(s).padStart(2, '0')} s`;
  };

  function clavier(e: KeyboardEvent, i: number, champ: Champ): void {
    if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const j = i + (e.key === 'ArrowDown' ? 1 : -1);
      if (j >= 0 && j < lignes.length) lignes[j][champ].focus();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !lectureSeule) {
      e.preventDefault();
      rappels.ajouter(i);
    }
  }

  function creerLigne(s: SousTitre, i: number): HTMLLIElement {
    const n = i + 1;
    const idNote = `st-note-${n}`;
    const champTemps = (valeur: number, etiquette: string, cle: 'debut' | 'fin') => {
      const c = el('input', {
        classe: `st-temps st-${cle}`,
        attrs: { type: 'text', inputmode: 'numeric', spellcheck: 'false', 'aria-label': etiquette, 'aria-describedby': idNote },
      });
      c.value = ecrireTemps(valeur);
      c.readOnly = lectureSeule;
      c.addEventListener('change', () => {
        const ms = lireTemps(c.value);
        if (ms === null) {
          c.setAttribute('aria-invalid', 'true');
          note.textContent = t.tempsIllisible;
          return;
        }
        c.removeAttribute('aria-invalid');
        c.value = ecrireTemps(ms);
        rappels.temps(i, cle, ms);
      });
      c.addEventListener('keydown', (e) => clavier(e, i, cle));
      return c;
    };
    const debut = champTemps(s.debut, t.debut(n), 'debut');
    const fin = champTemps(s.fin, t.fin(n), 'fin');
    const texte = el('textarea', { classe: 'st-texte', attrs: { rows: 2, 'aria-label': t.texte(n), 'aria-describedby': idNote } });
    texte.value = s.texte;
    texte.readOnly = lectureSeule;
    texte.addEventListener('input', () => rappels.texte(i, texte.value));
    texte.addEventListener('keydown', (e) => clavier(e, i, 'texte'));
    const supprimer = el('button', { classe: 'st-supprimer', texte: '×', attrs: { type: 'button', 'aria-label': t.supprimer(n), 'data-action': 'supprimer' } });
    supprimer.disabled = lectureSeule;
    supprimer.addEventListener('click', () => rappels.supprimer(i));
    const note = el('p', { classe: 'st-note', attrs: { id: idNote } });
    lignes.push({ debut, fin, texte, note });
    return el('li', { classe: 'st-ligne' }, [
      el('span', { classe: 'st-num', texte: String(n), attrs: { 'aria-hidden': 'true' } }),
      el('span', { classe: 'st-temps-groupe' }, [debut, el('span', { texte: '→', attrs: { 'aria-hidden': 'true' } }), fin]),
      texte,
      supprimer,
      note,
    ]);
  }

  return {
    outils,
    zone,
    dessiner(l) {
      nombre = l.length;
      lignes = [];
      liste.textContent = '';
      liste.append(...l.map(creerLigne));
      this.verifier(l);
    },
    verifier(l) {
      nombre = l.length;
      l.forEach((_, i) => {
        const ligne = lignes[i];
        if (!ligne || ligne.debut.hasAttribute('aria-invalid') || ligne.fin.hasAttribute('aria-invalid')) return;
        const p = probleme(l, i);
        ligne.note.textContent = p === 'fin_avant_debut' ? t.finAvantDebut : p === 'chevauche_suivant' ? t.chevauche : '';
        ligne.fin.toggleAttribute('aria-invalid', p === 'fin_avant_debut');
      });
      const trie = estTrie(l);
      desordre.hidden = trie;
      trier.hidden = trie;
      trier.disabled = lectureSeule || trie;
      vide.hidden = l.length > 0;
      resume.textContent = t.resume(l.length, duree(l.length ? Math.max(...l.map((s) => s.fin)) : 0));
    },
    focaliser(i, champ) {
      lignes[i]?.[champ].focus();
    },
    annoncer(texte) {
      annonce.textContent = texte;
    },
  };
}
