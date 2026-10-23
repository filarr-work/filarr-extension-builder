/**
 * vue — la feuille de dessin (SVG) et ses outils.
 *
 * SVG plutôt que `<canvas>` : chaque trait reste un nœud, ce qui rend
 * l'annulation triviale (on retire un nœud), le dessin net à tout zoom, et la
 * vue identique à l'export HTML.
 *
 * Deux façons de dessiner, au même résultat :
 *  - le pointeur (souris, stylet, doigt) : on capture le pointeur au premier
 *    contact, le trait suit, il est validé au lâcher ;
 *  - le clavier : la feuille est focalisable, un crayon s'y déplace aux
 *    flèches, Entrée le pose puis le lève, Échap abandonne le trait. Chaque
 *    étape est annoncée dans une région `aria-live`.
 */

import { cheminSvg, EPAISSEUR_MAX, prolonger, type Croquis, type Trait } from './croquis';
import { el, svg } from './dom';
import type { Textes } from './i18n';

export const PALETTE = ['#1f2937', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed', '#ffffff'];
export const EPAISSEURS = [2, 4, 8, 16, 32];

export interface RappelsVue {
  tracer(t: Trait): void;
  annuler(): void;
  retablir(): void;
  effacer(): void;
}

export interface Vue {
  outils: HTMLElement;
  feuille: HTMLElement;
  actualiser(c: Croquis, peutAnnuler: boolean, peutRetablir: boolean): void;
}

export function creerVue(o: { t: Textes; lectureSeule: boolean; rappels: RappelsVue }): Vue {
  const { t, lectureSeule, rappels } = o;
  let couleur = PALETTE[0];
  let epaisseur = 4;
  let largeur = 1200;
  let hauteur = 800;

  // ── Les outils ──
  const pastilles = PALETTE.map((c) => {
    const b = el('button', {
      classe: 'cq-pastille',
      attrs: { type: 'button', role: 'radio', 'aria-label': t.nomsCouleurs[c] ?? c, 'data-couleur': c },
    });
    b.style.setProperty('--pastille', c);
    b.disabled = lectureSeule;
    b.addEventListener('click', () => choisirCouleur(c));
    return b;
  });
  const groupe = el('div', { classe: 'cq-couleurs', attrs: { role: 'radiogroup', 'aria-label': t.couleurs } }, pastilles);
  // Flèches dans le groupe : un seul arrêt de tabulation, comme un groupe radio natif.
  groupe.addEventListener('keydown', (e) => {
    const sens = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!sens || lectureSeule) return;
    e.preventDefault();
    const i = (PALETTE.indexOf(couleur) + sens + PALETTE.length) % PALETTE.length;
    choisirCouleur(PALETTE[i]);
    pastilles[i].focus();
  });
  const choixEpaisseur = el('select', { classe: 'cq-epaisseur', attrs: { 'aria-label': t.epaisseur } });
  for (const e of EPAISSEURS) choixEpaisseur.append(el('option', { texte: `${e} px`, attrs: { value: e } }));
  choixEpaisseur.value = String(epaisseur);
  choixEpaisseur.disabled = lectureSeule;
  choixEpaisseur.addEventListener('change', () => {
    epaisseur = Math.min(EPAISSEUR_MAX, Number(choixEpaisseur.value) || 4);
    rafraichirCurseur();
  });
  const bouton = (texte: string, etiquette: string, action: string, fn: () => void) => {
    const b = el('button', { classe: 'cq-bouton', texte, attrs: { type: 'button', 'aria-label': etiquette, title: etiquette, 'data-action': action } });
    b.addEventListener('click', fn);
    return b;
  };
  const bAnnuler = bouton('↶', t.annuler, 'annuler', () => rappels.annuler());
  const bRetablir = bouton('↷', t.retablir, 'retablir', () => rappels.retablir());
  const bEffacer = bouton(t.effacer, t.effacer, 'effacer', () => rappels.effacer());
  const outils = el('div', { classe: 'cq-outils', attrs: { role: 'toolbar', 'aria-label': t.outils } }, [
    groupe,
    choixEpaisseur,
    bAnnuler,
    bRetablir,
    bEffacer,
  ]);

  function choisirCouleur(c: string): void {
    couleur = c;
    pastilles.forEach((b, i) => {
      const actif = PALETTE[i] === c;
      b.setAttribute('aria-checked', String(actif));
      b.tabIndex = actif ? 0 : -1;
    });
    rafraichirCurseur();
  }

  // ── La feuille ──
  const fond = svg('rect', { class: 'cq-fond', x: 0, y: 0, width: largeur, height: hauteur });
  const traits = svg('g', { class: 'cq-traits', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const enCours = svg('path', { class: 'cq-encours', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const curseur = svg('circle', { class: 'cq-curseur', r: 4 });
  const toile = svg('svg', {
    class: 'cq-toile',
    viewBox: `0 0 ${largeur} ${hauteur}`,
    tabindex: 0,
    role: 'application',
    'aria-describedby': 'cq-aide',
  }, [fond, traits, enCours, curseur]);
  const aide = el('p', { classe: 'cq-cache', texte: t.aide, attrs: { id: 'cq-aide' } });
  const annonce = el('div', { classe: 'cq-cache', attrs: { 'aria-live': 'polite' } });
  const feuille = el('div', { classe: 'cq-feuille' }, [toile, aide, annonce]);

  let points: number[] | null = null;
  let pointeur: number | null = null;
  const crayon = { x: largeur / 2, y: hauteur / 2 };

  function dessinerEnCours(): void {
    if (!points) {
      enCours.removeAttribute('d');
      return;
    }
    enCours.setAttribute('d', cheminSvg({ couleur, epaisseur, points }));
    enCours.setAttribute('stroke', couleur);
    enCours.setAttribute('stroke-width', String(epaisseur));
  }

  function rafraichirCurseur(): void {
    curseur.setAttribute('cx', String(crayon.x));
    curseur.setAttribute('cy', String(crayon.y));
    curseur.setAttribute('r', String(Math.max(3, epaisseur / 2)));
    curseur.setAttribute('stroke', couleur);
    curseur.classList.toggle('cq-pose', points !== null && pointeur === null);
  }

  function valider(): void {
    if (points && points.length >= 2) {
      const n = points.length / 2;
      rappels.tracer({ couleur, epaisseur, points });
      annonce.textContent = pointeur === null ? t.traitFini(n) : '';
    }
    points = null;
    pointeur = null;
    dessinerEnCours();
    rafraichirCurseur();
  }

  /** Des coordonnées d'écran vers celles de la feuille (`viewBox`, « meet »). */
  function versFeuille(e: PointerEvent): [number, number] {
    const r = toile.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return [e.clientX, e.clientY];
    const s = Math.min(r.width / largeur, r.height / hauteur);
    const ox = r.left + (r.width - largeur * s) / 2;
    const oy = r.top + (r.height - hauteur * s) / 2;
    return [Math.min(largeur, Math.max(0, (e.clientX - ox) / s)), Math.min(hauteur, Math.max(0, (e.clientY - oy) / s))];
  }

  toile.addEventListener('pointerdown', (e) => {
    if (lectureSeule || e.button !== 0 || pointeur !== null) return;
    e.preventDefault();
    toile.setPointerCapture?.(e.pointerId);
    pointeur = e.pointerId;
    const [x, y] = versFeuille(e);
    points = prolonger([], x, y);
    dessinerEnCours();
  });
  toile.addEventListener('pointermove', (e) => {
    if (pointeur !== e.pointerId || !points) return;
    const [x, y] = versFeuille(e);
    points = prolonger(points, x, y);
    dessinerEnCours();
  });
  const lacher = (e: PointerEvent) => {
    if (pointeur !== e.pointerId) return;
    toile.releasePointerCapture?.(e.pointerId);
    if (e.type === 'pointercancel') {
      points = null;
      pointeur = null;
      dessinerEnCours();
      return;
    }
    // Le lâcher porte sa propre position : elle termine le trait.
    if (points) points = prolonger(points, ...versFeuille(e));
    valider();
  };
  toile.addEventListener('pointerup', lacher);
  toile.addEventListener('pointercancel', lacher);

  toile.addEventListener('keydown', (e) => {
    if (lectureSeule || e.ctrlKey || e.metaKey) return;
    const pas = e.altKey ? 1 : e.shiftKey ? 50 : 10;
    const fleches: Record<string, [number, number]> = {
      ArrowLeft: [-pas, 0],
      ArrowRight: [pas, 0],
      ArrowUp: [0, -pas],
      ArrowDown: [0, pas],
    };
    const d = fleches[e.key];
    if (d) {
      e.preventDefault();
      crayon.x = Math.min(largeur, Math.max(0, crayon.x + d[0]));
      crayon.y = Math.min(hauteur, Math.max(0, crayon.y + d[1]));
      if (points && pointeur === null) {
        points = prolonger(points, crayon.x, crayon.y, 0);
        dessinerEnCours();
      }
      rafraichirCurseur();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (pointeur !== null) return;
      if (points) valider();
      else {
        points = prolonger([], crayon.x, crayon.y);
        annonce.textContent = t.crayonPose;
        dessinerEnCours();
        rafraichirCurseur();
      }
      return;
    }
    if (e.key === 'Escape' && points && pointeur === null) {
      e.preventDefault();
      points = null;
      annonce.textContent = t.traitAnnule;
      dessinerEnCours();
      rafraichirCurseur();
    }
  });

  // Les traits déjà dessinés : on garde ceux qui n'ont pas changé, on retire ou
  // ajoute le reste. Annuler retire un nœud, il ne redessine pas la feuille.
  let rendus: { trait: Trait; noeud: SVGPathElement }[] = [];

  choisirCouleur(couleur);
  [bAnnuler, bRetablir, bEffacer].forEach((b) => (b.disabled = lectureSeule));

  return {
    outils,
    feuille,
    actualiser(c, peutAnnuler, peutRetablir) {
      if (c.largeur !== largeur || c.hauteur !== hauteur) {
        largeur = c.largeur;
        hauteur = c.hauteur;
        toile.setAttribute('viewBox', `0 0 ${largeur} ${hauteur}`);
        fond.setAttribute('width', String(largeur));
        fond.setAttribute('height', String(hauteur));
        crayon.x = largeur / 2;
        crayon.y = hauteur / 2;
      }
      fond.setAttribute('fill', c.fond);
      let commun = 0;
      while (commun < rendus.length && commun < c.traits.length && rendus[commun].trait === c.traits[commun]) commun++;
      for (const r of rendus.slice(commun)) r.noeud.remove();
      rendus = rendus.slice(0, commun);
      for (const trait of c.traits.slice(commun)) {
        const noeud = svg('path', { d: cheminSvg(trait), stroke: trait.couleur, 'stroke-width': trait.epaisseur });
        traits.append(noeud);
        rendus.push({ trait, noeud });
      }
      toile.setAttribute('aria-label', t.toile(c.traits.length));
      bAnnuler.disabled = lectureSeule || !peutAnnuler;
      bRetablir.disabled = lectureSeule || !peutRetablir;
      bEffacer.disabled = lectureSeule || c.traits.length === 0;
      rafraichirCurseur();
    },
  };
}
