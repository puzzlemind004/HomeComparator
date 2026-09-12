import { Injectable, InjectionToken, inject, signal, type Signal } from '@angular/core';
import { MAXIMUM_DESKTOP, MAXIMUM_MOBILE } from './selection-comparaison';

/**
 * Le seuil au-dessus duquel l'écran est large, en pixels CSS.
 *
 * C'est **le même que celui de la feuille de style** — `64rem` dans
 * `biens-page.scss`, où il fait basculer le tableau et les cartes (ADR-0006).
 * Écrit en pixels ici parce que `matchMedia` ne lit pas les `rem` de la page
 * : 64 × 16 px, la taille de base du navigateur n'étant pas modifiée par le
 * carnet.
 *
 * Le doublon est assumé et se surveille : deux seuils qui divergeraient
 * feraient afficher les cartes pendant que la sélection autorise encore
 * quatre Biens, soit quatre colonnes sur un écran qui n'en tient que deux.
 * Il n'y a pas de moyen de partager une valeur entre une feuille Sass et un
 * `matchMedia` sans monter une chaîne de build pour un seul nombre ; le
 * commentaire de chaque côté est ce qui les tient ensemble.
 */
export const SEUIL_ECRAN_LARGE = 1024;

/**
 * La requête média correspondante, écrite une fois : c'est elle que le
 * service observe, et celle que les tests posent.
 */
export const REQUETE_ECRAN_LARGE = `(min-width: ${SEUIL_ECRAN_LARGE}px)`;

/**
 * De quoi observer une requête média : ce que `window.matchMedia` offre,
 * réduit à ce que ce service en lit.
 *
 * Le type est déclaré plutôt qu'emprunté à la lib DOM pour que le service
 * s'éprouve avec un objet écrit à la main : `MediaQueryList` porte une
 * douzaine de membres dépréciés qu'un faux devrait alors tous fournir.
 */
export type MatchMedia = (requete: string) => {
  matches: boolean;
  addEventListener: (type: 'change', ecouteur: (evenement: { matches: boolean }) => void) => void;
};

/**
 * Le `matchMedia` du navigateur, ou `null` là où il n'y en a pas — rendu
 * serveur, ou environnement de test sans DOM.
 */
function matchMediaDuNavigateur(): MatchMedia | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }

  return (requete) => window.matchMedia(requete);
}

/**
 * Ce par quoi le service observe la largeur de la fenêtre.
 *
 * Un jeton plutôt qu'un appel direct à `window` dans le service : Angular
 * réclame de toute façon un jeton pour un paramètre qui n'est pas une
 * classe, et celui-ci a l'avantage de nommer la dépendance au lieu de la
 * cacher. Sa fabrique rend le `matchMedia` du navigateur, ou `null` là où il
 * n'y en a pas.
 */
export const MATCH_MEDIA = new InjectionToken<MatchMedia | null>('MatchMedia', {
  providedIn: 'root',
  factory: matchMediaDuNavigateur,
});

/**
 * Ce que l'écran mesure : est-il assez large pour comparer plus de deux
 * Biens (#12) ?
 *
 * **La largeur décide seule**, comme pour le choix entre tableau et cartes :
 * aucun réglage n'est offert à l'acheteur et aucun n'est retenu (ADR-0006).
 * Une fenêtre redimensionnée change de maximum en cours de route, sans rien
 * recharger — c'est ce que `matchMedia` donne et qu'une simple lecture de
 * `innerWidth` au démarrage ne donnerait pas.
 *
 * Pourquoi un service, quand le reste de la bascule mobile/desktop tient en
 * CSS : le plafond de la sélection est une **règle et non une présentation**.
 * Une feuille de style peut masquer une troisième colonne, elle ne peut pas
 * empêcher de la sélectionner — l'acheteur cliquerait un troisième Bien et
 * ne verrait rien se passer. C'est le seul endroit du carnet où la largeur
 * remonte jusqu'au TypeScript, et c'est pour cela qu'elle y remonte par un
 * service injectable plutôt que par un appel direct dans un composant : les
 * écrans se testent alors sans navigateur, en posant un faux.
 */
@Injectable({ providedIn: 'root' })
export class LargeurEcran {
  private readonly large = signal(false);

  /** Vrai quand l'écran est au-dessus du seuil. */
  readonly ecranLarge: Signal<boolean> = this.large.asReadonly();

  /**
   * `matchMedia` vient d'un jeton plutôt que d'une lecture directe de
   * `window`, ce qui rend le service éprouvable sans DOM : les tests
   * fournissent le leur, et n'ont ni à écrire sur un global ni à le
   * restaurer après coup — c'est ce qui garde ce module testable comme ses
   * voisins de `criteres/`.
   *
   * Le jeton rend `null` là où il n'y a pas de navigateur — rendu serveur,
   * environnement sans DOM. L'écran étroit est alors la réponse : celle qui
   * borne le plus, et ne promet pas une place qui n'existe peut-être pas.
   */
  constructor() {
    // La dépendance passe par `inject` et non par un paramètre de
    // constructeur : Angular réclame un jeton pour chaque paramètre d'un
    // injectable, optionnel compris, et `MatchMedia` est un type — il n'en
    // fournit donc aucun (NG2003). Les tests posent le leur en fournissant
    // `MATCH_MEDIA` sur un injecteur, comme `biens-page.spec.ts` fournit son
    // service.
    const matchMedia = inject(MATCH_MEDIA);

    if (!matchMedia) {
      return;
    }

    const requete = matchMedia(REQUETE_ECRAN_LARGE);

    this.large.set(requete.matches);

    // Aucun désabonnement : le service vit aussi longtemps que
    // l'application, `providedIn: 'root'` le donnant en un seul exemplaire.
    // Un `addEventListener` sans retrait serait une fuite s'il était monté
    // par écran ; il ne l'est pas.
    requete.addEventListener('change', (evenement) => this.large.set(evenement.matches));
  }

  /**
   * Combien de Biens l'écran courant permet de comparer.
   *
   * C'est ce que lit la page : elle n'a pas à connaître le seuil, seulement
   * le plafond qui en découle.
   */
  maximumComparaison(): number {
    return this.large() ? MAXIMUM_DESKTOP : MAXIMUM_MOBILE;
  }
}
