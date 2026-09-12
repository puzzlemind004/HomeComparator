import { Component, Input, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Bien } from './bien';
import { lignesFaceAFace, type LigneFaceAFace } from '../criteres/face-a-face';
import { libelleStatut, type Statut } from '../criteres/statut';

/** Un Bien tel que l'en-tête d'une colonne le présente. */
export interface ColonneBien {
  bien: Bien;

  /**
   * Le Statut, porté par l'en-tête et non par une ligne : il dit où en est
   * le Bien et ne se compare pas d'un Bien à l'autre (ADR-0002). Il n'a donc
   * pas de ligne dans le face-à-face, pas plus qu'il n'a de Colonne dans le
   * tableau.
   */
  statut: Statut;
  libelleStatut: string;
}

/**
 * Le face-à-face : les Critères en lignes, un Bien par colonne, la meilleure
 * valeur mise en évidence sur chaque ligne (#12).
 *
 * C'est la vue qui donne son nom au produit. Elle sert à **départager des
 * finalistes**, non à parcourir la recherche — le tableau (#10) et les
 * cartes (#11) s'en chargent. C'est ce qui explique qu'elle affiche toutes
 * ses lignes d'un coup, sans les groupes pliables du tableau : à deux ou
 * quatre colonnes, le débordement se fait en hauteur, où il ne coûte rien.
 *
 * Les axes sont **inversés par rapport au tableau** : un Bien par colonne et
 * un Critère par ligne, quand le tableau met un Bien par ligne. C'est ce qui
 * permet de lire un Critère d'un balayage horizontal court — deux ou quatre
 * valeurs côte à côte — là où le tableau ferait parcourir seize colonnes.
 *
 * Le composant ne décide de rien qu'il puisse déléguer : les lignes, la
 * désignation du meilleur et l'écriture des valeurs viennent de
 * `face-a-face.ts`. Il ne tient que le branchement au gabarit — ce qui
 * laisse la règle qui compte, **un Critère non renseigné ne gagne ni ne
 * perd**, vérifiable sans monter d'écran.
 */
@Component({
  selector: 'app-comparaison-biens',
  imports: [RouterLink],
  styleUrl: './comparaison-biens.scss',
  templateUrl: './comparaison-biens.html',
})
export class ComparaisonBiens {
  /**
   * Les Biens à comparer, dans l'ordre où l'acheteur les a choisis — c'est
   * cet ordre qui fixe celui des colonnes.
   *
   * Un signal inscriptible alimenté par un `@Input`, plutôt qu'un `input()` :
   * les écrans du projet sont construits sans TestBed, et un signal d'entrée
   * ne se lit pas hors d'un environnement de test Angular complet. Le parent
   * l'alimente par la liaison ci-dessous, les tests par `set`.
   */
  readonly biens = signal<readonly Bien[]>([]);

  /**
   * La liaison du parent, qui se contente d'alimenter le signal. Elle porte
   * un nom distinct parce qu'un alias serait refusé par `no-input-rename`.
   */
  @Input()
  set biensAComparer(biens: readonly Bien[]) {
    this.biens.set(biens);
  }

  /** Les en-têtes de colonnes : un Bien, son Libellé, son Statut. */
  readonly colonnes = computed<ColonneBien[]>(() =>
    this.biens().map((bien) => ({
      bien,
      statut: bien.statut,
      libelleStatut: libelleStatut(bien.statut),
    })),
  );

  /**
   * Les lignes, prêtes à s'afficher.
   *
   * Le calcul est fait une fois par changement de Biens et non à chaque
   * lecture du gabarit, comme les lignes du tableau (#10) : formater seize
   * lignes à chaque détection de changement se paierait à chaque clic.
   */
  readonly lignes = computed<readonly LigneFaceAFace[]>(() =>
    lignesFaceAFace(this.biens().map((bien) => bien.criteres)),
  );
}
