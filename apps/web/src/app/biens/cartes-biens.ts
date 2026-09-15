import { Component, Input, Output, EventEmitter, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Bien } from './bien';
import { COLONNES_DECISIVES, caseDe, type CaseColonne } from '../criteres/colonnes';
import { TRI_INITIAL, trier } from '../criteres/tri';
import { libelleStatut, type Statut } from '../criteres/statut';
import { completude, type Completude } from '../criteres/valeurs';
import { MAXIMUM_MOBILE } from '../criteres/selection-comparaison';

/** Une carte : un Bien, tel qu'un écran étroit le montre. */
export interface Carte {
  bien: Bien;

  /**
   * Le Statut, porté par la carte et non par une case : il dit où en est le
   * Bien, et ne se compare pas d'un Bien à l'autre (ADR-0002). C'est de lui
   * que la pastille tire sa couleur.
   */
  statut: Statut;
  libelleStatut: string;

  /** Une case par Colonne décisive, dans l'ordre où `COLONNES` les porte. */
  cases: CaseColonne[];

  /**
   * Où en est la saisie de ce Bien, que la barre sous les Colonnes affiche.
   *
   * Elle porte sur tous les Critères de la définition et non sur les quatre
   * Colonnes décisives de la carte : ce que l'acheteur veut savoir est ce
   * qu'il lui reste à demander à l'agence (#6), pas quelle part de la carte
   * est remplie. Une carte dont les quatre Colonnes sont pleines peut fort
   * bien laisser onze Critères en attente, et c'est cela que l'acheteur doit
   * voir en rouvrant son carnet.
   *
   * Elle remplace le compte des Colonnes décisives manquantes que la carte
   * annonçait au lecteur d'écran : il décrivait la carte plutôt que le Bien,
   * et « à demander » est désormais écrit dans chaque case vide, donc lu.
   */
  completude: Completude;

  /** Vrai quand le Bien fait partie de ceux qu'on compare face à face (#12). */
  selectionne: boolean;

  /**
   * Vrai quand la case de sélection ne répond plus : le plafond est atteint
   * et ce Bien n'en fait pas partie. Sur un téléphone le plafond est de deux
   * (ADR-0006), et il s'atteint donc vite : la case reste à sa place pour
   * que l'acheteur voie pourquoi elle ne répond pas.
   */
  selectionBloquee: boolean;
}

/**
 * Les cartes mobiles : une carte par Bien, sur les Colonnes qui permettent de
 * le reconnaître d'un coup d'œil (#11, ADR-0006).
 *
 * C'est une présentation distincte du tableau, et non son adaptation. Un
 * tableau de seize Colonnes est illisible sur un téléphone quelle que soit
 * l'astuce employée, et le défilement horizontal détruit précisément ce qui
 * fait l'intérêt d'un tableau — la comparaison d'un coup d'œil. Empiler les
 * seize Colonnes à la verticale ne ferait que réécrire le même tableau.
 *
 * La carte porte donc ce sous quoi l'acheteur reconnaît un Bien — son
 * Libellé, son Statut — et les Colonnes les plus décisives : le prix, le prix
 * au mètre carré, la surface et la ville. Elles viennent de
 * `COLONNES_DECISIVES` et non d'une liste écrite ici : les deux présentations
 * montrent les mêmes Biens, et une valeur ne peut pas s'écrire autrement d'un
 * écran à l'autre.
 *
 * Le prix au mètre carré n'est pas un Critère (ADR-0013), et c'est pourtant
 * sur la carte qu'il porte le plus : les Biens s'y lisent l'un après l'autre
 * plutôt que côte à côte, et c'est lui qui permet de situer celui qu'on
 * regarde sans avoir l'autre sous les yeux.
 *
 * **La photo est en tête de carte** depuis #13, en bandeau, et seulement si
 * le Bien en porte une. La carte se lit sans elle, ce qu'#11 demandait
 * explicitement : c'est le Libellé qui fait reconnaître un Bien, la photo qui
 * le confirme.
 *
 * La barre de complétude sous les Colonnes dit où en est la saisie du Bien
 * (#6). Elle ne porte pas sur les Colonnes de la carte mais sur la définition
 * entière : c'est la question que se pose l'acheteur en rouvrant son carnet.
 *
 * Le composant ne décide de rien qu'il puisse déléguer : les Colonnes
 * décisives viennent de `colonnes.ts`, l'ordre des cartes de `trier`, et
 * l'écriture des valeurs de `formatage.ts` à travers la colonne. Il ne tient
 * que le branchement au gabarit.
 */
@Component({
  selector: 'app-cartes-biens',
  imports: [RouterLink],
  styleUrl: './cartes-biens.scss',
  templateUrl: './cartes-biens.html',
})
export class CartesBiens {
  /**
   * Les Biens à afficher, tels que l'écran les a reçus de l'API.
   *
   * Un signal inscriptible alimenté par un `@Input`, plutôt qu'un `input()` :
   * les cartes sont construites sans TestBed comme les autres écrans du
   * projet, et un signal d'entrée ne se lit pas hors d'un environnement de
   * test Angular complet. Le parent l'alimente par la liaison ci-dessous, les
   * tests par `set`, et le composant ne voit qu'un signal dans les deux cas.
   */
  readonly biens = signal<readonly Bien[]>([]);

  /**
   * La liaison du parent, qui se contente d'alimenter le signal. Elle porte
   * un nom distinct parce qu'un alias serait refusé par `no-input-rename`.
   */
  @Input()
  set biensAAfficher(biens: readonly Bien[]) {
    this.biens.set(biens);
  }

  /**
   * Les Biens retenus pour la comparaison face-à-face (#12), tels que la
   * page les tient.
   *
   * Les cartes ne décident pas de la sélection : elles la montrent et
   * signalent les clics. C'est la page qui la détient, parce que le tableau
   * la montre aussi et que les deux présentations doivent s'accorder.
   */
  readonly selection = signal<readonly number[]>([]);

  @Input()
  set selectionCourante(selection: readonly number[]) {
    this.selection.set(selection);
  }

  /**
   * Le plafond de la sélection, que la largeur de l'écran décide (ADR-0006).
   *
   * Il part du plafond le plus bas et non de zéro : les cartes se rendent une
   * première fois avant que la liaison du parent ne les alimente, et un
   * plafond nul y désactiverait toutes les cases le temps d'une frame.
   */
  readonly maximum = signal(MAXIMUM_MOBILE);

  @Input()
  set maximumSelection(maximum: number) {
    this.maximum.set(maximum);
  }

  /** Le clic sur une case de sélection : la page en tire la nouvelle liste. */
  @Output()
  readonly selectionBasculee = new EventEmitter<number>();

  /**
   * Le clic sur une case de sélection.
   *
   * Au plafond, le clic est **annulé** plutôt que la case désactivée :
   * `disabled` la retirerait du parcours clavier, et sur un téléphone — où
   * le plafond est de deux (ADR-0006) — la quasi-totalité des cases
   * deviendrait introuvable dès le deuxième Bien coché. `preventDefault`
   * empêche la case de se cocher, ce que `aria-disabled` seul ne fait pas.
   *
   * L'événement est `click` et non `change` : seul le premier est annulable
   * avant que la case n'ait changé d'état, et la barre d'espace au clavier
   * en émet un aussi.
   */
  choisir(evenement: Event, carte: Carte): void {
    if (carte.selectionBloquee) {
      evenement.preventDefault();
      return;
    }

    this.selectionBasculee.emit(carte.bien.id);
  }

  /**
   * Les Colonnes que porte une carte. Exposé pour le gabarit, qui écrit leur
   * libellé à côté de la valeur : sur une carte, aucune en-tête de colonne ne
   * dit ce qu'un nombre représente.
   */
  readonly colonnes = COLONNES_DECISIVES;

  /**
   * Les cartes, prêtes à s'afficher, classées par Libellé.
   *
   * C'est l'ordre du tableau à son ouverture (`TRI_INITIAL`), et non celui de
   * l'API : passer du téléphone au bureau ne doit pas rebattre la liste. Les
   * cartes ne se trient pas — le tri est le geste d'un tableau, où les valeurs
   * d'une colonne s'alignent ; empilées, elles ne se comparent plus.
   *
   * Le calcul est fait une fois par changement de Biens et non à chaque
   * lecture du gabarit, comme pour les lignes du tableau (#10).
   */
  readonly cartes = computed<Carte[]>(() => {
    const selection = this.selection();
    const pleine = selection.length >= this.maximum();

    return trier(this.biens(), TRI_INITIAL).map((bien) => {
      const cases = this.colonnes.map((colonne) => caseDe(colonne, bien.criteres));
      const selectionne = selection.includes(bien.id);

      return {
        bien,
        statut: bien.statut,
        libelleStatut: libelleStatut(bien.statut),
        cases,
        completude: completude(bien.criteres),
        selectionne,
        // Un Bien déjà retenu garde sa case active : le plafond borne
        // l'ajout, jamais le retrait.
        selectionBloquee: pleine && !selectionne,
      };
    });
  });
}
