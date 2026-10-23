/**
 * vue — le tableau blanc à l'écran : une surface SVG, des traits et des textes.
 *
 * Deux outils : le CRAYON (on trace au pointeur) et la SÉLECTION (on choisit un
 * élément, on le déplace au pointeur ou aux flèches, Suppr l'efface). Chaque
 * élément est focalisable : au clavier, Tab parcourt le tableau, Entrée sur un
 * texte ouvre son champ. Ajouter un texte se fait par un bouton — pas besoin de
 * pointeur pour participer.
 *
 * La vue ne touche jamais au `Y.Doc` : elle montre un `Tableau` et rapporte des
 * gestes, en coordonnées de la surface.
 */

import { svg, el } from './dom';
import type { Textes } from './i18n';
import type { Element as Objet, Tableau } from './tableau';

export const COULEURS = ['#1f2937', '#dc2626', '#2563eb', '#16a34a', '#d97706'];

export interface RappelsVue {
  tracer(points: number[], couleur: string): void;
  ajouterTexte(couleur: string): void;
  deplacer(id: string, dx: number, dy: number): void;
  supprimer(id: string): void;
  ecrire(id: string, texte: string): void;
  annuler(): void;
  retablir(): void;
}

export interface Vue {
  outils: HTMLElement;
  zone: HTMLElement;
  dessiner(t: Tableau): void;
  selectionner(id: string | null): void;
  etatHistorique(annuler: boolean, retablir: boolean): void;
  annoncer(texte: string): void;
}

const chemin = (p: number[]) => (p.length === 2 ? `M${p[0]} ${p[1]}l0.01 0` : `M${p[0]} ${p[1]}` + p.slice(2).reduce((d, v, i) => d + (i % 2 === 0 ? `L${v}` : ` ${v}`), ''));

export function creerVue(o: { t: Textes; lectureSeule: boolean; enSalle: boolean; rappels: RappelsVue }): Vue {
  const { t, lectureSeule, rappels } = o;
  let outil: 'crayon' | 'selection' = 'crayon';
  let couleur = COULEURS[0];
  let selection: string | null = null;
  let tableau: Tableau = { largeur: 1600, hauteur: 1000, elements: [] };
  const noeuds = new Map<string, { g: SVGGElement; e: Objet }>();

  // ── Outils ──
  const boutonOutil = (nom: 'crayon' | 'selection', texte: string) => {
    const b = el('button', { classe: 'tb-bouton', texte, attrs: { type: 'button', 'aria-pressed': String(outil === nom), 'data-outil': nom } });
    b.addEventListener('click', () => {
      outil = nom;
      bCrayon.setAttribute('aria-pressed', String(outil === 'crayon'));
      bSelection.setAttribute('aria-pressed', String(outil === 'selection'));
      surface.classList.toggle('tb-mode-selection', outil === 'selection');
    });
    return b;
  };
  const bCrayon = boutonOutil('crayon', t.crayon);
  const bSelection = boutonOutil('selection', t.selection);
  const pastilles = COULEURS.map((c) => {
    const b = el('button', { classe: 'tb-pastille', attrs: { type: 'button', 'aria-label': t.couleurs[c] ?? c, 'aria-pressed': String(c === couleur), 'data-couleur': c } });
    b.style.setProperty('--pastille', c);
    b.addEventListener('click', () => {
      couleur = c;
      pastilles.forEach((p, i) => p.setAttribute('aria-pressed', String(COULEURS[i] === c)));
    });
    return b;
  });
  const bTexte = el('button', { classe: 'tb-bouton', texte: t.ajouterTexte, attrs: { type: 'button', 'data-action': 'texte' } });
  bTexte.addEventListener('click', () => rappels.ajouterTexte(couleur));
  const bAnnuler = el('button', { classe: 'tb-bouton', texte: '↶', attrs: { type: 'button', 'aria-label': t.annuler, title: t.annuler, 'data-action': 'annuler' } });
  bAnnuler.addEventListener('click', () => rappels.annuler());
  const bRetablir = el('button', { classe: 'tb-bouton', texte: '↷', attrs: { type: 'button', 'aria-label': t.retablir, title: t.retablir, 'data-action': 'retablir' } });
  bRetablir.addEventListener('click', () => rappels.retablir());
  const bSupprimer = el('button', { classe: 'tb-bouton', texte: t.supprimer, attrs: { type: 'button', 'data-action': 'supprimer' } });
  bSupprimer.addEventListener('click', () => selection && rappels.supprimer(selection));
  const champ = el('input', { classe: 'tb-champ', attrs: { type: 'text', 'aria-label': t.texteSelection, placeholder: t.texteSelection, maxlength: 500 } });
  champ.addEventListener('input', () => selection && rappels.ecrire(selection, champ.value));
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      if (selection) noeuds.get(selection)?.g.focus();
    }
  });
  for (const b of [bCrayon, bSelection, ...pastilles, bTexte, bAnnuler, bRetablir, bSupprimer]) b.disabled = lectureSeule;
  champ.readOnly = lectureSeule;
  const badge = el('span', { classe: 'tb-badge', texte: o.enSalle ? t.enSalle : t.seul });
  const outils = el('div', { classe: 'tb-outils', attrs: { role: 'toolbar', 'aria-label': t.outils } }, [
    bCrayon,
    bSelection,
    el('span', { classe: 'tb-groupe' }, pastilles),
    bTexte,
    bAnnuler,
    bRetablir,
    bSupprimer,
    champ,
    badge,
  ]);

  // ── Surface ──
  const fond = svg('rect', { class: 'tb-fond', x: 0, y: 0, width: 1600, height: 1000 });
  const calque = svg('g', { class: 'tb-calque' });
  const enCours = svg('path', { class: 'tb-encours', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const surface = svg('svg', { class: 'tb-surface', viewBox: '0 0 1600 1000', role: 'group', 'aria-label': t.surface }, [fond, calque, enCours]);
  const annonce = el('div', { classe: 'tb-cache', attrs: { 'aria-live': 'polite' } });
  const zone = el('div', { classe: 'tb-zone' }, [surface, el('p', { classe: 'tb-aide', texte: t.aide }), annonce]);

  const versSurface = (e: PointerEvent): [number, number] => {
    const r = surface.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return [e.clientX, e.clientY];
    const s = Math.min(r.width / tableau.largeur, r.height / tableau.hauteur);
    const ox = r.left + (r.width - tableau.largeur * s) / 2;
    const oy = r.top + (r.height - tableau.hauteur * s) / 2;
    return [(e.clientX - ox) / s, (e.clientY - oy) / s];
  };

  // Le crayon : un trait par geste, validé au lâcher (une seule update pour la salle).
  let trace: { pointeur: number; points: number[] } | null = null;
  // La sélection : on déplace l'élément visuellement, le modèle change au lâcher.
  let prise: { pointeur: number; id: string; x0: number; y0: number; dx: number; dy: number } | null = null;

  surface.addEventListener('pointerdown', (e) => {
    if (lectureSeule || e.button !== 0) return;
    const [x, y] = versSurface(e);
    const cible = (e.target as Element | null)?.closest?.('[data-id]') ?? null;
    if (outil === 'selection') {
      const id = cible?.getAttribute('data-id') ?? null;
      selectionner(id);
      if (!id) return;
      e.preventDefault();
      surface.setPointerCapture?.(e.pointerId);
      prise = { pointeur: e.pointerId, id, x0: x, y0: y, dx: 0, dy: 0 };
      return;
    }
    e.preventDefault();
    surface.setPointerCapture?.(e.pointerId);
    trace = { pointeur: e.pointerId, points: [Math.round(x * 10) / 10, Math.round(y * 10) / 10] };
    enCours.setAttribute('stroke', couleur);
    enCours.setAttribute('stroke-width', '4');
    enCours.setAttribute('d', chemin(trace.points));
  });
  surface.addEventListener('pointermove', (e) => {
    const [x, y] = versSurface(e);
    if (trace && e.pointerId === trace.pointeur) {
      const p = trace.points;
      if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) >= 2) p.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
      enCours.setAttribute('d', chemin(p));
    } else if (prise && e.pointerId === prise.pointeur) {
      prise.dx = x - prise.x0;
      prise.dy = y - prise.y0;
      noeuds.get(prise.id)?.g.setAttribute('transform', `translate(${prise.dx} ${prise.dy})`);
    }
  });
  const lacher = (e: PointerEvent) => {
    surface.releasePointerCapture?.(e.pointerId);
    if (trace && e.pointerId === trace.pointeur) {
      const [x, y] = versSurface(e);
      const p = trace.points;
      if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) >= 0.5) p.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
      trace = null;
      enCours.removeAttribute('d');
      if (e.type === 'pointerup') rappels.tracer(p, couleur);
    } else if (prise && e.pointerId === prise.pointeur) {
      const p = prise;
      prise = null;
      noeuds.get(p.id)?.g.removeAttribute('transform');
      if (e.type === 'pointerup' && (Math.abs(p.dx) >= 1 || Math.abs(p.dy) >= 1)) rappels.deplacer(p.id, p.dx, p.dy);
    }
  };
  surface.addEventListener('pointerup', lacher);
  surface.addEventListener('pointercancel', lacher);

  function clavierElement(e: KeyboardEvent, id: string): void {
    const el2 = noeuds.get(id)?.e;
    if (!el2) return;
    if (e.key === 'Enter' && el2.type === 'texte') {
      e.preventDefault();
      selectionner(id);
      champ.focus();
      return;
    }
    if (lectureSeule) return;
    const pas = e.shiftKey ? 50 : 10;
    const d: Record<string, [number, number]> = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] };
    if (d[e.key]) {
      e.preventDefault();
      rappels.deplacer(id, d[e.key][0], d[e.key][1]);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      rappels.supprimer(id);
    }
  }

  function creerNoeud(e: Objet): SVGGElement {
    const g = svg('g', { class: 'tb-element', tabindex: 0, 'data-id': e.id, role: 'img' });
    g.addEventListener('focus', () => selectionner(e.id));
    g.addEventListener('keydown', (ev) => clavierElement(ev, e.id));
    return g;
  }

  function remplir(g: SVGGElement, e: Objet): void {
    g.textContent = '';
    if (e.type === 'trait') {
      g.append(svg('path', { d: chemin(e.points), stroke: e.couleur, 'stroke-width': e.epaisseur, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      g.setAttribute('aria-label', t.unTrait);
    } else {
      const txt = svg('text', { x: e.x, y: e.y, fill: e.couleur, class: 'tb-texte' });
      txt.textContent = e.texte || '…';
      g.append(txt);
      g.setAttribute('aria-label', t.unTexte(e.texte));
    }
  }

  function selectionner(id: string | null): void {
    selection = id && noeuds.has(id) ? id : null;
    for (const [i, n] of noeuds) n.g.classList.toggle('tb-choisi', i === selection);
    const e = selection ? noeuds.get(selection)?.e : undefined;
    champ.disabled = lectureSeule || e?.type !== 'texte';
    if (e?.type === 'texte' && document.activeElement !== champ) champ.value = e.texte;
    if (e?.type !== 'texte') champ.value = '';
    bSupprimer.disabled = lectureSeule || !selection;
  }

  return {
    outils,
    zone,
    dessiner(tab) {
      tableau = tab;
      surface.setAttribute('viewBox', `0 0 ${tab.largeur} ${tab.hauteur}`);
      fond.setAttribute('width', String(tab.largeur));
      fond.setAttribute('height', String(tab.hauteur));
      const actif = document.activeElement;
      const ids = new Set(tab.elements.map((e) => e.id));
      for (const [id, n] of noeuds) {
        if (!ids.has(id)) {
          n.g.remove();
          noeuds.delete(id);
        }
      }
      tab.elements.forEach((e, i) => {
        let n = noeuds.get(e.id);
        if (!n) {
          n = { g: creerNoeud(e), e };
          noeuds.set(e.id, n);
          remplir(n.g, e);
        } else if (JSON.stringify(n.e) !== JSON.stringify(e)) {
          n.e = e;
          remplir(n.g, e);
        }
        if (calque.children[i] !== n.g) calque.insertBefore(n.g, calque.children[i] ?? null);
      });
      if (actif instanceof SVGElement && actif.isConnected && document.activeElement !== actif) actif.focus();
      selectionner(selection);
      surface.setAttribute('aria-label', t.surfaceN(tab.elements.length));
    },
    selectionner,
    etatHistorique(a, r) {
      bAnnuler.disabled = lectureSeule || !a;
      bRetablir.disabled = lectureSeule || !r;
    },
    annoncer(texte) {
      annonce.textContent = texte;
    },
  };
}
