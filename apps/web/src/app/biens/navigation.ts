import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SelectionComparaison } from './selection.service';
import { ROUTE_BIENS, ROUTE_COMPARAISON, ROUTE_EXPORT } from './carnet.routes';

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

  /** Où mène « + Repérer un Bien » : le carnet, et son formulaire de tête. */
  readonly routeBiens = ROUTE_BIENS;
}
