import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { SelectionComparaison } from './selection.service';
import {
  ROUTE_BIENS,
  ROUTE_COMPARAISON,
  ROUTE_EXPORT,
  routeCommenterBien,
} from './carnet.routes';

/**
 * L'identifiant du Bien dont on regarde la fiche, ou `null` partout ailleurs.
 *
 * Écrit comme une fonction sur l'adresse plutôt que lu dans l'arbre des
 * routes : la navigation vit dans la coque et non sous le `router-outlet`,
 * et n'a donc aucune route activée à interroger.
 *
 * La fiche seule compte, et pas l'écran de saisie qui lui est sous-jacent :
 * proposer « Commenter » pendant qu'on commente ne mènerait nulle part.
 */
export function bienDeLAdresse(adresse: string): number | null {
  const [chemin] = adresse.split(/[?#]/);
  const correspondance = /^\/biens\/(\d+)$/.exec(chemin);

  return correspondance ? Number(correspondance[1]) : null;
}

/** Une entrée du menu : où elle mène, et comment elle se marque courante. */
export interface EntreeNavigation {
  libelle: string;
  route: string;

  /**
   * Vrai quand l'entrée n'est courante que sur son adresse exacte.
   *
   * Seul l'accueil en a besoin, et il en a besoin **absolument** : « / » est
   * le préfixe de toutes les adresses, et une correspondance par préfixe
   * marquerait « Carnet » courant sur l'export comme sur la comparaison —
   * deux onglets allumés à la fois, ce qui ne veut plus rien dire.
   *
   * Les autres se satisfont du préfixe, et c'est voulu : la fiche d'un Bien
   * (`/biens/3`) est encore le carnet, et l'entrée reste allumée pendant
   * qu'on la consulte.
   */
  exact: boolean;
}

/**
 * La navigation du carnet (#124).
 *
 * La barre livrée par la refonte ne portait que la marque et la
 * déconnexion : la comparaison et l'export vivaient dans la page du carnet,
 * et des liens vers des sections n'auraient mené nulle part. Ils ont
 * maintenant leurs écrans, et cette navigation est ce qui les rend
 * atteignables — c'est tout l'objet de l'issue.
 *
 * **Le compteur est ce qui la distingue d'un menu ordinaire.** Le nombre de
 * Biens retenus se lit en permanence, depuis n'importe quel écran : c'est ce
 * qui rend la sélection visible hors du carnet, et sans quoi l'acheteur
 * arriverait sur la comparaison sans savoir ce qu'elle va montrer.
 *
 * **Une seule instance pour les deux dispositions.** La maquette pose une
 * barre au-dessus sur desktop et un pied fixe sur mobile ; ce sont deux
 * mises en page du même menu, et c'est la feuille de style qui choisit
 * — comme le tableau et les cartes (ADR-0006), à ceci près qu'ici le
 * composant est le même. Deux instances monteraient deux fois les mêmes
 * liens, et un lecteur d'écran annoncerait deux navigations.
 */
@Component({
  selector: 'app-navigation',
  imports: [RouterLink, RouterLinkActive],
  styleUrl: './navigation.scss',
  templateUrl: './navigation.html',
})
export class Navigation {
  private readonly selectionComparaison = inject(SelectionComparaison);
  private readonly router = inject(Router);

  /**
   * Les trois écrans, dans l'ordre de la maquette : le carnet, le
   * face-à-face, l'export. C'est l'ordre du parcours — on repère, on
   * compare, on emporte.
   *
   * La liste est une donnée et non trois blocs de gabarit recopiés : les
   * entrées ne diffèrent que par leur libellé et leur adresse, et les
   * écrire trois fois donnerait trois occasions d'oublier l'`aria-current`.
   */
  readonly entrees: readonly EntreeNavigation[] = [
    { libelle: 'Carnet', route: ROUTE_BIENS, exact: true },
    { libelle: 'Comparer', route: ROUTE_COMPARAISON, exact: false },
    { libelle: 'Exporter', route: ROUTE_EXPORT, exact: false },
  ];

  /** Le « (2) » de la maquette : les Biens retenus pour le face-à-face. */
  readonly compte = this.selectionComparaison.compte;

  /** L'entrée qui porte le compte — la seule à qui il veuille dire quelque chose. */
  readonly routeComparaison = ROUTE_COMPARAISON;

  /**
   * L'adresse courante, suivie pour savoir si l'on regarde une fiche.
   *
   * Un signal alimenté par les événements du routeur : la navigation est
   * montée une fois pour toute la session, et rien ne la reconstruit d'un
   * écran à l'autre. L'adresse de départ est prise à la construction, sans
   * quoi l'action resterait « Repérer » sur une fiche ouverte directement
   * par son lien — le cas d'un carnet qu'on rouvre sur le Bien qu'on visite.
   */
  private readonly adresse = signal(this.router.url);

  /**
   * Le Bien dont on regarde la fiche, ou `null` partout ailleurs. C'est ce
   * qui fait basculer l'action permanente du menu.
   */
  readonly bienCourant = computed(() => bienDeLAdresse(this.adresse()));

  /**
   * Où mène l'action permanente, et ce qu'elle dit.
   *
   * **Sur une fiche, c'est « Commenter »** ; partout ailleurs, « Repérer ».
   * Une même place pour deux gestes parce que c'est la même intention — la
   * seule chose qu'on vienne ajouter depuis n'importe où —, et parce que
   * pendant une visite, c'est un Commentaire qu'on ajoute et non un Bien.
   *
   * Deux entrées côte à côte auraient coûté la place que le pied de
   * navigation n'a pas sur un téléphone, et fait viser entre deux cibles
   * voisines au moment où l'on est debout dans une pièce.
   */
  readonly action = computed(() => {
    const bien = this.bienCourant();

    return bien === null
      ? { route: ROUTE_BIENS, libelle: 'Repérer', complement: 'un Bien', fragment: 'reperer' }
      : {
          route: routeCommenterBien(bien),
          libelle: 'Commenter',
          complement: 'ce Bien',
          fragment: undefined,
        };
  });

  constructor() {
    /**
     * Chaque changement d'écran met l'adresse à jour. `NavigationEnd` et non
     * le début : c'est l'adresse atteinte qui compte, et une navigation
     * refusée par un garde ferait autrement basculer l'action vers un écran
     * où l'on n'est pas allé.
     */
    this.router.events
      .pipe(filter((evenement): evenement is NavigationEnd => evenement instanceof NavigationEnd))
      .subscribe((evenement) => this.adresse.set(evenement.urlAfterRedirects));
  }
}
