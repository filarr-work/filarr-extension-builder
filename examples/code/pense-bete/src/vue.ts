/**
 * vue — le tableau à l'écran : des notes posées sur une surface, qu'on déplace
 * à la souris (poignée d'en-tête) OU au clavier (flèches sur la note).
 *
 * La vue ne décide de rien : elle montre un `Tableau` et des `Preferences`, et
 * rapporte les gestes par des rappels. Elle se RÉCONCILIE plutôt qu'elle ne se
 * redessine : recréer les nœuds à chaque frappe ferait perdre le focus et la
 * position du curseur dans la note en cours d'écriture.
 *
 * Accessibilité : chaque note est un groupe focalisable, nommé par son début
 * de texte ; ses commandes sont des boutons nommés ; chaque déplacement au
 * clavier est annoncé dans une région `aria-live`.
 */

import { el } from './dom';
import type { Textes } from './i18n';
import { HAUTEUR_MAX, LARGEUR_MAX, type Note, type Tableau } from './postit';
import { NIVEAUX_ZOOM, estRepliee, type Preferences } from './preferences';

export interface RappelsVue {
  ajouter(): void;
  deplacer(id: string, x: number, y: number): void;
  ecrire(id: string, texte: string): void;
  recolorer(id: string): void;
  supprimer(id: string): void;
  replier(id: string): void;
  zoomer(sens: 1 | -1): void;
}

export interface Vue {
  barre: HTMLElement;
  zone: HTMLElement;
  actualiser(t: Tableau, p: Preferences): void;
  annoncer(texte: string): void;
  focaliserNote(id: string | null): void;
  focaliserTexte(id: string): void;
}

interface VueNote {
  article: HTMLElement;
  entete: HTMLElement;
  texte: HTMLTextAreaElement;
  couleur: HTMLButtonElement;
  replier: HTMLButtonElement;
  supprimer: HTMLButtonElement;
  note: Note;
}

const PAS = 10;
const PAS_RAPIDE = 50;

export function creerVue(o: { t: Textes; lectureSeule: boolean; rappels: RappelsVue }): Vue {
  const { t, lectureSeule, rappels } = o;
  let zoom = 1;
  let notes: Note[] = [];
  const vues = new Map<string, VueNote>();

  const ajouter = el('button', { classe: 'pb-bouton', texte: t.ajouter, attrs: { type: 'button', 'data-action': 'ajouter' } });
  ajouter.disabled = lectureSeule;
  ajouter.addEventListener('click', () => rappels.ajouter());
  const moins = el('button', { classe: 'pb-bouton', texte: '−', attrs: { type: 'button', 'aria-label': t.zoomMoins, 'data-action': 'zoom-moins' } });
  const plus = el('button', { classe: 'pb-bouton', texte: '+', attrs: { type: 'button', 'aria-label': t.zoomPlus, 'data-action': 'zoom-plus' } });
  const niveau = el('span', { classe: 'pb-zoom', attrs: { 'aria-live': 'polite' } });
  moins.addEventListener('click', () => rappels.zoomer(-1));
  plus.addEventListener('click', () => rappels.zoomer(1));
  const barre = el('div', { classe: 'pb-outils' }, [ajouter, el('span', { classe: 'pb-groupe' }, [moins, niveau, plus])]);

  const aide = el('p', { classe: 'pb-cache', texte: t.aide, attrs: { id: 'pb-aide' } });
  const annonce = el('div', { classe: 'pb-cache', attrs: { 'aria-live': 'polite' } });
  const vide = el('p', { classe: 'pb-vide', texte: t.vide });
  const surface = el('div', { classe: 'pb-surface', attrs: { role: 'region', 'aria-label': t.tableau } });
  const dimension = el('div', { classe: 'pb-dimension' }, [surface]);
  const zone = el('div', { classe: 'pb-defilement' }, [vide, dimension, aide, annonce]);

  const courante = (id: string) => notes.find((n) => n.id === id);

  function creerVueNote(n: Note): VueNote {
    const couleur = el('button', { classe: 'pb-pastille', attrs: { type: 'button', 'data-action': 'couleur' } });
    const replier = el('button', { classe: 'pb-mini', attrs: { type: 'button', 'data-action': 'replier' } });
    const supprimer = el('button', { classe: 'pb-mini', texte: '×', attrs: { type: 'button', 'data-action': 'supprimer', 'aria-label': t.supprimer } });
    couleur.disabled = lectureSeule;
    supprimer.disabled = lectureSeule;
    const entete = el('div', { classe: 'pb-entete' }, [el('span', { classe: 'pb-poignee', texte: '⠿', attrs: { 'aria-hidden': 'true' } }), couleur, replier, supprimer]);
    const texte = el('textarea', { classe: 'pb-texte', attrs: { 'aria-label': t.texteNote } });
    texte.readOnly = lectureSeule;
    const article = el('article', {
      classe: 'pb-note',
      attrs: { tabindex: 0, 'data-id': n.id, 'aria-roledescription': 'post-it', 'aria-describedby': 'pb-aide' },
    }, [entete, texte]);
    const v: VueNote = { article, entete, texte, couleur, replier, supprimer, note: n };

    couleur.addEventListener('click', () => rappels.recolorer(v.note.id));
    replier.addEventListener('click', () => rappels.replier(v.note.id));
    supprimer.addEventListener('click', () => rappels.supprimer(v.note.id));
    texte.addEventListener('input', () => rappels.ecrire(v.note.id, texte.value));
    texte.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        article.focus();
      }
    });
    article.addEventListener('keydown', (e) => clavierNote(e, v));
    brancherGlisser(v);
    return v;
  }

  function clavierNote(e: KeyboardEvent, v: VueNote): void {
    if (e.target !== v.article) return;
    const n = courante(v.note.id);
    if (!n) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!v.texte.hidden) v.texte.focus();
      return;
    }
    if (lectureSeule) return;
    const pas = e.shiftKey ? PAS_RAPIDE : PAS;
    const fleches: Record<string, [number, number]> = {
      ArrowLeft: [-pas, 0],
      ArrowRight: [pas, 0],
      ArrowUp: [0, -pas],
      ArrowDown: [0, pas],
    };
    const d = fleches[e.key];
    if (d) {
      e.preventDefault();
      rappels.deplacer(n.id, n.x + d[0], n.y + d[1]);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      rappels.supprimer(n.id);
    }
  }

  /** Glisser par l'en-tête : la note suit le pointeur, le modèle ne change qu'au lâcher. */
  function brancherGlisser(v: VueNote): void {
    let prise: { pointeur: number; x0: number; y0: number; nx: number; ny: number; x: number; y: number } | null = null;
    v.entete.addEventListener('pointerdown', (e) => {
      if (lectureSeule || e.button !== 0 || (e.target as Element).closest('button')) return;
      const n = courante(v.note.id);
      if (!n) return;
      e.preventDefault();
      v.entete.setPointerCapture?.(e.pointerId);
      prise = { pointeur: e.pointerId, x0: e.clientX, y0: e.clientY, nx: n.x, ny: n.y, x: n.x, y: n.y };
      v.article.classList.add('pb-glisse');
    });
    v.entete.addEventListener('pointermove', (e) => {
      if (!prise || e.pointerId !== prise.pointeur) return;
      prise.x = Math.round(prise.nx + (e.clientX - prise.x0) / zoom);
      prise.y = Math.round(prise.ny + (e.clientY - prise.y0) / zoom);
      v.article.style.left = `${prise.x}px`;
      v.article.style.top = `${prise.y}px`;
    });
    const lacher = (e: PointerEvent) => {
      if (!prise || e.pointerId !== prise.pointeur) return;
      const p = prise;
      prise = null;
      v.article.classList.remove('pb-glisse');
      v.entete.releasePointerCapture?.(e.pointerId);
      if (e.type === 'pointerup' && (p.x !== p.nx || p.y !== p.ny)) rappels.deplacer(v.note.id, p.x, p.y);
      else {
        v.article.style.left = `${p.nx}px`;
        v.article.style.top = `${p.ny}px`;
      }
    };
    v.entete.addEventListener('pointerup', lacher);
    v.entete.addEventListener('pointercancel', lacher);
  }

  function mettreAJour(v: VueNote, n: Note, p: Preferences): void {
    v.note = n;
    v.article.style.left = `${n.x}px`;
    v.article.style.top = `${n.y}px`;
    v.article.dataset.couleur = n.couleur;
    const resume = n.texte.trim().split('\n')[0].slice(0, 40);
    v.article.setAttribute('aria-label', resume ? t.note(resume) : t.noteVide);
    if (v.texte.value !== n.texte) v.texte.value = n.texte;
    v.couleur.setAttribute('aria-label', t.couleur(t.couleurs[n.couleur]));
    const repliee = estRepliee(p, n.id);
    v.texte.hidden = repliee;
    v.article.classList.toggle('pb-repliee', repliee);
    v.replier.textContent = repliee ? '▸' : '▾';
    v.replier.setAttribute('aria-expanded', String(!repliee));
    v.replier.setAttribute('aria-label', repliee ? t.deplier : t.replier);
  }

  return {
    barre,
    zone,
    actualiser(tab, p) {
      notes = tab.notes;
      zoom = p.zoom;
      surface.style.transform = `scale(${zoom})`;
      dimension.style.width = `${LARGEUR_MAX * zoom}px`;
      dimension.style.height = `${HAUTEUR_MAX * zoom}px`;
      niveau.textContent = t.zoom(Math.round(zoom * 100));
      moins.disabled = zoom <= NIVEAUX_ZOOM[0];
      plus.disabled = zoom >= NIVEAUX_ZOOM[NIVEAUX_ZOOM.length - 1];

      // Le focus survit à la réconciliation : déplacer un nœud focalisé le lui fait perdre.
      const actif = document.activeElement as HTMLElement | null;
      const selection = actif instanceof HTMLTextAreaElement ? [actif.selectionStart, actif.selectionEnd] : null;

      const ids = new Set(notes.map((n) => n.id));
      for (const [id, v] of vues) {
        if (!ids.has(id)) {
          v.article.remove();
          vues.delete(id);
        }
      }
      let precedent: Element | null = null;
      for (const n of notes) {
        let v = vues.get(n.id);
        if (!v) {
          v = creerVueNote(n);
          vues.set(n.id, v);
        }
        mettreAJour(v, n, p);
        const attendu: ChildNode | null = precedent ? precedent.nextSibling : surface.firstChild;
        if (v.article !== attendu) surface.insertBefore(v.article, attendu);
        precedent = v.article;
      }
      vide.hidden = notes.length > 0;

      if (actif && actif.isConnected && document.activeElement !== actif) {
        actif.focus({ preventScroll: true });
        if (selection && actif instanceof HTMLTextAreaElement) actif.setSelectionRange(selection[0], selection[1]);
      }
    },
    annoncer(texte) {
      annonce.textContent = texte;
    },
    focaliserNote(id) {
      if (id) vues.get(id)?.article.focus();
      else ajouter.focus();
    },
    focaliserTexte(id) {
      vues.get(id)?.texte.focus();
    },
  };
}
