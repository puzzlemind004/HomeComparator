import { Component, Input, Output, EventEmitter, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Bien } from './bien';
import {
  GROUPES_COLONNES,
  caseDe,
  type CaseColonne,
  type Colonne,
  type GroupeColonnes,
} from '../criteres/colonnes';
import { TRI_INITIAL, basculer, trier, type Tri } from '../criteres/tri';
import { libelleStatut, type Statut } from '../criteres/statut';
import { situation } from '../criteres/situation';
import { MAXIMUM_MOBILE } from '../criteres/selection-comparaison';
import type { GroupeCritere } from '../criteres/critere';

/**
 * Un groupe tel que les commandes le présentent : son titre, son état, et
 * les colonnes qu'il porte.
 *
 * Les commandes vivent **au-dessus** du tableau et non dans son en-tête. Un
 * groupe masqué n'y laisserait qu'une colonne d'une vingtaine de pixels,
 * trop étroite pour porter son nom : l'acheteur y verrait trois bandes
 * anonymes sans savoir laquelle ramène la localisation. Au-dessus, les
 * quatre groupes sont nommés en permanence, affichés ou non.
 */
export interface CommandeGroupe {
  groupe: GroupeCritere;
  libelle: string;
  deplie: boolean;

  /** Ses colonnes, qui ne paraissent au tableau que s'il est affiché. */
  colonnes: readonly Colonne[];
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

  /**
   * Où en est le Bien dans le temps — « visite le 21/09 », « offre à
   * 258 000 € » —, ou la chaîne vide quand il n'y a rien à en dire (#120).
   *
   * La même phrase que sur les cartes, tirée du même module : les deux
   * présentations montrent les mêmes Biens (ADR-0006), et un Bien visité
   * demain doit se repérer pareil sur les deux écrans.
   *
   * Elle est posée sous le Libellé et non dans une colonne à elle : le
   * tableau en porte déjà seize, et une de plus le ferait défiler de côté —
   * ce qu'ADR-0006 rejette pour ce que cela détruit.
   */
  situation: string;

  /** Une case par colonne visible, dans l'ordre où l'en-tête les pose. */
  cases: CaseColonne[];

  /** Vrai quand le Bien fait partie de ceux qu'on compare face à face (#12). */
  selectionne: boolean;

  /**
   * Vrai quand la case de sélection ne répond plus : le plafond est atteint
   * et ce Bien n'en fait pas partie.
   *
   * La case est désactivée plutôt que masquée : elle reste à sa place, et
   * l'acheteur voit que la sélection est pleine au lieu de cliquer dans le
   * vide. Ce que le plafond vaut, et pourquoi, est dit au-dessus du tableau
   * par la page — le tableau n'en sait rien.
   */
  selectionBloquee: boolean;
}

/**
 * Le tableau desktop : une ligne par Bien, une colonne par Critère, triable
 * sur chaque colonne (#10, ADR-0006).
 *
 * C'est la vue qui répond à « qu'est-ce que j'ai en stock » et qui fait voir
 * d'un coup d'œil le moins cher ou le plus grand. Elle ne sert que le
 * desktop : sur mobile, un tableau de seize Colonnes est illisible quelle
 * que soit l'astuce employée, et les cartes font l'objet d'un ticket à part
 * (ADR-0006).
 *
 * Les Critères s'y choisissent par groupe — budget, logement, localisation,
 * confort. Seul « Budget » est affiché à l'ouverture : affichés tous les
 * quatre, seize Colonnes en `nowrap` — plus le Libellé et le Statut —
 * réclament de l'ordre de 2400 px pour un seuil d'apparition à 1024, et le
 * tableau défilerait de côté — ce
 * qu'ADR-0006 rejette pour ce que cela détruit, la comparaison d'un coup
 * d'œil (#49). Au-delà, le débordement est demandé par l'acheteur, non subi.
 *
 * Le composant ne décide de rien qu'il puisse déléguer : les colonnes et
 * leurs groupes viennent de `colonnes.ts`, l'ordre des lignes de `trier`. Il
 * ne détient que l'état du tri, celui des groupes affichés et le branchement
 * au gabarit — ce qui laisse les règles qui comptent, l'ordre des colonnes
 * et le placement des valeurs absentes, vérifiables sans monter d'écran.
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

  /**
   * Les Biens retenus pour la comparaison face-à-face (#12), tels que la
   * page les tient.
   *
   * Le tableau ne décide pas de la sélection : il la montre et signale les
   * clics. C'est la page qui la détient, parce que les cartes la montrent
   * aussi et que les deux présentations doivent s'accorder — passer du
   * téléphone au bureau ne doit pas vider ce qu'on avait choisi.
   */
  readonly selection = signal<readonly number[]>([]);

  @Input()
  set selectionCourante(selection: readonly number[]) {
    this.selection.set(selection);
  }

  /**
   * Le plafond de la sélection, que la largeur de l'écran décide (ADR-0006).
   * Le tableau ne l'applique pas — la page s'en charge — mais il a besoin de
   * le connaître pour désactiver les cases qui ne répondraient plus.
   *
   * Il part du plafond le plus bas et non de zéro : le composant se rend une
   * première fois avant que la liaison du parent ne l'alimente, et un
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

  /** Les groupes de colonnes, dans l'ordre où la définition les ordonne (ADR-0004). */
  readonly groupes: readonly GroupeColonnes[] = GROUPES_COLONNES;

  /**
   * Les groupes affichés. « Budget » seul à l'ouverture : c'est ce sur quoi
   * l'acheteur ouvre son carnet — environ 850 px mesurés au navigateur avec
   * le Libellé et le Statut, contre un seuil d'apparition à 1024 (#49).
   *
   * N'importe lequel des quatre tient seul à cette largeur : « Logement », le
   * plus large avec ses cinq Critères, en réclame environ 960. C'est en
   * affichant deux groupes que l'acheteur fait déborder le tableau — un
   * défilement qu'il demande, et non qu'on lui impose. `colonnes.spec.ts`
   * tient ces largeurs à jour.
   *
   * Le choix est éphémère et ne se retient pas d'une visite à l'autre : le
   * carnet ne persiste aucune préférence, et en créer une première est une
   * décision qui mérite son propre ticket (#49).
   */
  private readonly deplies = signal<ReadonlySet<GroupeCritere>>(new Set(['budget']));

  /**
   * Les colonnes affichées : celles des groupes dépliés, dans l'ordre de la
   * définition et non dans celui des clics.
   *
   * Le Libellé et le Statut n'en sont pas et ne s'y trouvent donc pas : le
   * gabarit les pose en tête de chaque ligne, hors de tout groupe, et ils
   * restent visibles quels que soient les groupes affichés.
   */
  readonly colonnesVisibles = computed<readonly Colonne[]>(() =>
    this.groupes.filter(({ groupe }) => this.estDeplie(groupe)).flatMap(({ colonnes }) => colonnes),
  );

  /**
   * Les quatre groupes tels que les commandes les présentent, dans l'ordre
   * de la définition. Tous y figurent en permanence : c'est ce qui permet de
   * rouvrir un groupe masqué, qui ne laisse aucune trace dans le tableau.
   */
  readonly commandes = computed<CommandeGroupe[]>(() =>
    this.groupes.map(({ groupe, libelle, colonnes }) => ({
      groupe,
      libelle,
      colonnes,
      deplie: this.estDeplie(groupe),
    })),
  );

  /** Le tri courant : aucun à l'ouverture, les Biens classés par Libellé. */
  readonly tri = signal<Tri>(TRI_INITIAL);

  /**
   * Les lignes, triées et prêtes à s'afficher.
   *
   * Le calcul est fait une fois par changement de Biens, de tri ou de
   * groupes affichés, et non à chaque lecture du gabarit : avec plusieurs
   * dizaines de Biens, formater les cases à chaque détection de changement
   * se paierait à chaque clic (#10). Seules les colonnes visibles sont
   * formatées — celles d'un groupe masqué ne s'affichent pas, et les
   * calculer ne se verrait nulle part.
   */
  readonly lignes = computed<LigneTableau[]>(() => {
    const selection = this.selection();
    const pleine = selection.length >= this.maximum();

    return trier(this.biens(), this.tri()).map((bien) => {
      const selectionne = selection.includes(bien.id);

      return {
        bien,
        statut: bien.statut,
        libelleStatut: libelleStatut(bien.statut),
        situation: situation(bien.statut, bien.champsStatut),
        cases: this.colonnesVisibles().map((colonne) => caseDe(colonne, bien.criteres)),
        selectionne,
        // Un Bien déjà retenu garde sa case active : le plafond borne
        // l'ajout, jamais le retrait, sans quoi la sélection pleine serait
        // un cul-de-sac.
        selectionBloquee: pleine && !selectionne,
      };
    });
  });

  /**
   * Vrai quand le groupe est affiché. C'est de là que sa bascule tire son
   * `aria-pressed` : le bouton dit un état, non une action (ADR-0005).
   */
  estDeplie(groupe: GroupeCritere): boolean {
    return this.deplies().has(groupe);
  }

  /**
   * Le clic sur la bascule d'un groupe : afficher ses colonnes, ou les
   * retirer.
   *
   * Le tri n'est pas touché. Retirer le groupe de la colonne triée laisse
   * donc les lignes dans l'ordre demandé, et la colonne reparaît triée telle
   * qu'on l'avait laissée : masquer est un geste d'affichage, et défaire un
   * classement au passage ferait sauter les lignes sans qu'on l'ait demandé.
   *
   * **Retirer les quatre groupes est permis**, et laisse un tableau réduit au
   * Libellé et au Statut — qui ne sont pas des Colonnes et ne comparent donc
   * rien. L'état est voulu : l'acheteur l'a demandé, les quatre bascules
   * restent nommées au-dessus du tableau, et un clic l'en sort. Interdire le
   * retrait du dernier groupe coûterait un bouton qui ne répond pas, qu'il
   * faudrait alors expliquer au lecteur d'écran (ADR-0005) — soit un défaut
   * échangé contre un autre.
   */
  basculerGroupe(groupe: GroupeCritere): void {
    this.deplies.update((deplies) => {
      const suivant = new Set(deplies);

      if (!suivant.delete(groupe)) {
        suivant.add(groupe);
      }

      return suivant;
    });
  }

  /**
   * Le clic sur une case de sélection.
   *
   * Au plafond, le clic est **annulé** plutôt que la case désactivée :
   * `disabled` la retirerait du parcours clavier, et l'acheteur qui navigue
   * à la tabulation ne la rencontrerait plus (ADR-0005). `preventDefault`
   * empêche la case de se cocher, ce que `aria-disabled` seul ne fait pas —
   * l'attribut annonce un état, il n'a aucun effet sur le comportement.
   *
   * L'événement est `click` et non `change` : seul le premier est annulable
   * avant que la case n'ait changé d'état. Au clavier, la barre d'espace sur
   * une case émet elle aussi un `click`, donc les deux chemins passent ici.
   */
  choisir(evenement: Event, ligne: LigneTableau): void {
    if (ligne.selectionBloquee) {
      evenement.preventDefault();
      return;
    }

    this.selectionBasculee.emit(ligne.bien.id);
  }

  /** Le clic sur un en-tête : trier sur cette colonne, ou renverser le sens. */
  basculerTri(colonne: string): void {
    this.tri.update((tri) => basculer(tri, colonne));
  }

  /**
   * Ce que l'en-tête annonce dans son `aria-sort`.
   *
   * Une seule colonne est triée à la fois : les autres rendent `none`, sans
   * quoi un lecteur d'écran annoncerait toutes les colonnes triées
   * (ADR-0005).
   */
  sensTriDe(colonne: string): 'ascending' | 'descending' | 'none' {
    const tri = this.tri();

    if (tri.colonne !== colonne) {
      return 'none';
    }

    return tri.sens === 'croissant' ? 'ascending' : 'descending';
  }
}
