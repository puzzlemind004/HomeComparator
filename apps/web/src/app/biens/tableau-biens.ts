import { Component, Input, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Bien } from './bien';
import { COLONNES, type Colonne } from '../criteres/colonnes';
import { TRI_INITIAL, basculer, trier, type Tri } from '../criteres/tri';
import { libelleStatut, type Statut } from '../criteres/statut';

/** Une case du tableau : ce qui s'y écrit, et si le Critère est renseigné. */
export interface CaseTableau {
  colonne: Colonne;

  /** La valeur écrite, ou la chaîne vide quand le Critère n'est pas renseigné. */
  texte: string;

  /**
   * Vrai dès qu'une valeur est portée, zéro compris.
   *
   * C'est de là que la case tire sa mise en évidence : ce qui manque est ce
   * qu'il reste à demander à l'agence (#6). La distinction ne se lit pas du
   * texte — un zéro s'écrit « 0 » et un Critère absent s'écrit vide, mais un
   * texte vide saisi s'écrirait pareil.
   */
  renseigne: boolean;
}

/** Une ligne du tableau : un Bien, son Statut, et ses cases. */
export interface LigneTableau {
  bien: Bien;

  /**
   * Le Statut, porté par la ligne et non par une case : il est visible sur
   * chaque ligne (#10) sans être une colonne triable, parce qu'il ne se
   * compare pas d'un Bien à l'autre (ADR-0002).
   */
  statut: Statut;
  libelleStatut: string;

  cases: CaseTableau[];
}

/**
 * Le tableau desktop : une ligne par Bien, une colonne par Critère, triable
 * sur chaque colonne (#10, ADR-0006).
 *
 * C'est la vue qui répond à « qu'est-ce que j'ai en stock » et qui fait voir
 * d'un coup d'œil le moins cher ou le plus grand. Elle ne sert que le
 * desktop : sur mobile, un tableau de seize colonnes est illisible quelle
 * que soit l'astuce employée, et les cartes font l'objet d'un ticket à part
 * (ADR-0006).
 *
 * Le composant ne décide de rien qu'il puisse déléguer : les colonnes
 * viennent de `colonnes.ts`, l'ordre des lignes de `trier`. Il ne détient
 * que l'état du tri et le branchement au gabarit — ce qui laisse les deux
 * règles qui comptent, l'ordre des colonnes et le placement des valeurs
 * absentes, vérifiables sans monter d'écran.
 */
@Component({
  selector: 'app-tableau-biens',
  imports: [RouterLink],
  styleUrl: './tableau-biens.scss',
  templateUrl: './tableau-biens.html',
})
export class TableauBiens {
  /**
   * Les Biens à afficher, tels que l'écran les a reçus de l'API.
   *
   * Un signal inscriptible alimenté par un `@Input`, plutôt qu'un `input()` :
   * le tableau est construit sans TestBed comme les autres écrans du projet,
   * et un signal d'entrée ne se lit pas hors d'un environnement de test
   * Angular complet. Le parent l'alimente par la liaison ci-dessous, les
   * tests par `set`, et le composant ne voit qu'un signal dans les deux cas.
   */
  readonly biens = signal<readonly Bien[]>([]);

  /**
   * La liaison du parent, qui se contente d'alimenter le signal. Elle porte
   * un nom distinct parce qu'un alias serait refusé par `no-input-rename` ;
   * le reste du composant lit `biens()` sans savoir d'où la valeur vient.
   */
  @Input()
  set biensAAfficher(biens: readonly Bien[]) {
    this.biens.set(biens);
  }

  /** Les colonnes, dans l'ordre où la définition les ordonne (ADR-0004). */
  readonly colonnes: readonly Colonne[] = COLONNES;

  /** Le tri courant : aucun à l'ouverture, les Biens classés par Libellé. */
  readonly tri = signal<Tri>(TRI_INITIAL);

  /**
   * Les lignes, triées et prêtes à s'afficher.
   *
   * Le calcul est fait une fois par changement de Biens ou de tri, et non à
   * chaque lecture du gabarit : avec plusieurs dizaines de Biens et seize
   * colonnes, formater les cases à chaque détection de changement se paierait
   * à chaque clic (#10).
   */
  readonly lignes = computed<LigneTableau[]>(() =>
    trier(this.biens(), this.tri()).map((bien) => ({
      bien,
      statut: bien.statut,
      libelleStatut: libelleStatut(bien.statut),
      cases: this.colonnes.map((colonne) => ({
        colonne,
        texte: colonne.texte(bien.criteres),
        renseigne: colonne.valeur(bien.criteres) !== null,
      })),
    })),
  );

  /** Le clic sur un en-tête : trier sur cette colonne, ou renverser le sens. */
  basculerTri(colonne: string): void {
    this.tri.update((tri) => basculer(tri, colonne));
  }

  /**
   * Ce que l'en-tête annonce dans son `aria-sort`.
   *
   * Une seule colonne est triée à la fois : les autres rendent `none`, sans
   * quoi un lecteur d'écran annoncerait seize colonnes triées (ADR-0005).
   */
  sensTriDe(colonne: string): 'ascending' | 'descending' | 'none' {
    const tri = this.tri();

    if (tri.colonne !== colonne) {
      return 'none';
    }

    return tri.sens === 'croissant' ? 'ascending' : 'descending';
  }
}
