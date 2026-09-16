import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BienService, type ListeBiens } from './bien.service';
import { STATUTS, libelleStatut, type Statut } from '../criteres/statut';
import { CartesBiens } from './cartes-biens';
import { TableauBiens } from './tableau-biens';
import { SelectionComparaison } from './selection.service';
import { comparaisonPossible } from '../criteres/selection-comparaison';
import { ROUTE_COMPARAISON, ROUTE_REPERER } from './carnet.routes';
import type { Bien } from './bien';

/**
 * Un filtre tel que l'en-tête le propose : le Statut sur lequel il porte —
 * `null` pour « Tous » —, son libellé, et combien de Biens il montrerait.
 *
 * Le compte est ce que la maquette met dans la pastille, et ce n'est pas un
 * ornement : « À contacter 2 » dit qu'il reste deux coups de téléphone à
 * passer sans qu'on ait à ouvrir le filtre pour le découvrir.
 */
export interface FiltreStatut {
  statut: Statut | null;
  libelle: string;
  compte: number;
}

/**
 * Le carnet : la liste des Biens, et rien d'autre.
 *
 * **Le formulaire de repérage n'y est plus** — il a son écran (`reperer-page`),
 * ce que la maquette demande. La liste est ce qu'on vient voir en ouvrant
 * l'application, et deux champs plus un bouton la repoussaient sous la ligne
 * de flottaison à chaque ouverture. Le geste garde son importance : le « + »
 * de l'en-tête y mène, et la navigation aussi.
 *
 * **La liste entière est chargée, puis filtrée en mémoire.** C'est ce qui
 * permet aux pastilles de porter leur compte — « À contacter 2 » — sans un
 * appel par Statut : un compte par pastille sur six pastilles ferait six
 * requêtes à chaque ouverture, là où le carnet d'un acheteur tient en
 * quelques dizaines de Biens. Le filtre en SQL (ADR-0004) reste ce que
 * l'API sait faire, et `BienService.lister` le garde pour qui en aura besoin.
 */
@Component({
  selector: 'app-biens-page',
  imports: [CartesBiens, RouterLink, TableauBiens],
  styleUrl: './biens-page.scss',
  templateUrl: './biens-page.html',
})
export class BiensPage {
  private readonly bienService = inject(BienService);
  private readonly selectionComparaison = inject(SelectionComparaison);

  /**
   * La liste, ou l'aveu qu'on n'a pas pu la charger. `null` tant que l'API
   * n'a pas répondu : les trois états sont distincts à l'écran, une liste
   * vide ne devant jamais être confondue avec un chargement raté.
   */
  readonly liste = signal<ListeBiens | null>(null);

  /** Les six Statuts, tels que le filtre les propose. */
  readonly statuts = STATUTS;

  /**
   * Le Statut sur lequel la liste est filtrée, ou `null` pour tout voir.
   *
   * `null` est le défaut : ouvrir le carnet montre tous les Biens, sorties
   * comprises. Un filtre par défaut cacherait des Biens sans le dire, et
   * c'est précisément ce qu'un carnet ne doit pas faire (#7).
   */
  readonly filtre = signal<Statut | null>(null);

  /**
   * Les Biens retenus pour le face-à-face (#12).
   *
   * La sélection ne vit plus ici : elle est dans `SelectionComparaison`,
   * parce que le face-à-face a maintenant son écran et la navigation son
   * compteur (#124). Trois lecteurs, dont deux ne sont pas des descendants
   * de cette page — un signal de composant ne leur parvient pas.
   *
   * Ce que la page garde, c'est ce qui dépend de **sa** liste : quels Biens
   * retenus elle sait afficher, et combien son filtre en masque. Le service
   * ne connaît que des identifiants, et n'a aucun moyen de répondre à cela.
   */
  readonly selection = this.selectionComparaison.selection;

  /** Combien de Biens l'écran courant permet de comparer (ADR-0006). */
  readonly maximumSelection = this.selectionComparaison.maximum;

  /** Ce qu'il faut de Biens pour qu'il y ait quelque chose à comparer. */
  readonly minimumComparaison = this.selectionComparaison.minimum;

  /**
   * Vrai quand le plafond est atteint : la page le dit au-dessus de la
   * liste, plutôt que de laisser l'acheteur découvrir des cases qui ne
   * répondent plus sans savoir pourquoi.
   */
  readonly selectionPleine = this.selectionComparaison.pleine;

  /** L'écran où la comparaison se regarde, désormais (#124). */
  readonly routeComparaison = ROUTE_COMPARAISON;

  /**
   * L'écran de repérage, que le « + » de l'en-tête vise.
   *
   * Un bouton-icône dans l'en-tête plutôt qu'une entrée de menu : la
   * création est séparée de la liste depuis la refonte, et le geste qui
   * alimente le carnet doit rester à portée de pouce là où l'on regarde
   * la liste.
   */
  readonly routeReperer = ROUTE_REPERER;

  /**
   * Vrai dès que deux Biens **comparables** sont retenus : le face-à-face a
   * alors de quoi s'afficher, et la page invite à y aller.
   *
   * Elle se lit sur `biensCompares` et non sur la sélection, dont les deux
   * peuvent différer depuis #93 : un Bien retenu que le filtre masque garde
   * sa place, mais l'écran n'a pas ses valeurs. Compter sur la sélection
   * ferait promettre un face-à-face à une seule colonne, qui ne compare rien.
   */
  readonly comparaisonAffichee = computed(() => comparaisonPossible(this.biensCompares()));

  /**
   * Les Biens que l'écran montre : ceux du Statut filtré, ou tous.
   *
   * Le filtre s'applique ici plutôt qu'à l'API, qui rend la liste entière
   * une fois pour toutes : c'est ce qui permet aux pastilles de porter leur
   * compte sans une requête chacune, et ce qui rend le filtrage instantané.
   *
   * L'ordre de l'API est conservé — `filter` ne réordonne pas : la liste est
   * rendue triée, et c'est ce tri-là que les cartes et le tableau reprennent.
   */
  readonly biensAffiches = computed<Bien[]>(() => {
    const liste = this.liste();

    if (!liste?.chargee) {
      return [];
    }

    const filtre = this.filtre();

    return filtre === null ? liste.biens : liste.biens.filter((bien) => bien.statut === filtre);
  });

  /**
   * Les pastilles de l'en-tête : « Tous 10 », « À contacter 2 », et les
   * quatre autres — chacune avec ce qu'elle montrerait.
   *
   * **Le compte est ce que la maquette demande**, et il vaut mieux qu'un
   * ornement : il dit où en est la recherche sans qu'on ait à essayer les
   * filtres un par un. « À contacter 2 » est le nombre de coups de
   * téléphone qui restent.
   *
   * Les six Statuts sont toujours proposés, y compris ceux que personne ne
   * porte : une pastille à zéro dit « aucun Bien écarté », ce qui est une
   * réponse. La faire disparaître ferait bouger la barre à chaque
   * changement de Statut, et l'acheteur chercherait un filtre qui était là
   * la veille.
   *
   * Vide tant que la liste n'a pas été chargée : des pastilles toutes à zéro
   * pendant le chargement se liraient comme un carnet vide.
   */
  readonly filtres = computed<FiltreStatut[]>(() => {
    const liste = this.liste();

    if (!liste?.chargee) {
      return [];
    }

    const biens = liste.biens;

    return [
      { statut: null, libelle: 'Tous', compte: biens.length },
      ...STATUTS.map(({ valeur, libelle }) => ({
        statut: valeur,
        libelle,
        compte: biens.filter((bien) => bien.statut === valeur).length,
      })),
    ];
  });

  /**
   * Ce que porte le carnet, en une ligne : « 10 Biens · 3 à visiter ».
   *
   * C'est la phrase de la maquette, et les deux membres ne disent pas la
   * même chose que les pastilles : le premier donne la taille du carnet, le
   * second ce qui demande une action prochaine. Les pastilles, elles,
   * servent à filtrer.
   *
   * Le second membre disparaît quand aucun Bien n'est à visiter : « 10 Biens
   * · 0 à visiter » annoncerait un vide, là où le silence est la bonne
   * réponse. Chaîne vide tant que la liste n'a pas été chargée, ce que le
   * gabarit traite en n'affichant rien.
   */
  readonly resume = computed(() => {
    const liste = this.liste();

    if (!liste?.chargee || liste.biens.length === 0) {
      return '';
    }

    const total = liste.biens.length;
    const aVisiter = liste.biens.filter((bien) => bien.statut === 'aVisiter').length;
    const biens = `${total} Bien${total > 1 ? 's' : ''}`;

    return aVisiter ? `${biens} · ${aVisiter} à visiter` : biens;
  });

  /**
   * Les Biens à comparer, dans l'ordre de la sélection et non dans celui de
   * la liste : c'est l'ordre que l'acheteur a demandé, et le seul qui ne
   * fasse pas bouger les colonnes déjà posées quand il en ajoute une.
   */
  readonly biensCompares = computed<Bien[]>(() => {
    const biens = this.biensAffiches();

    // Un Bien retenu mais que la liste courante ne rend pas n'a pas de
    // colonne : l'écran n'a pas ses valeurs, et une colonne vide ne
    // comparerait rien (#93). Il n'est pas abandonné pour autant — il reste
    // dans `selection`, et `retenusMasques` le dit à l'acheteur.
    return this.selection()
      .map((bienId) => biens.find((bien) => bien.id === bienId))
      .filter((bien): bien is Bien => bien !== undefined);
  });

  /**
   * Combien de Biens la comparaison retient que la liste ne montre pas
   * (#93).
   *
   * Sans ce compte, l'acheteur qui filtre verrait sa comparaison maigrir
   * sans explication, et croirait avoir perdu une sélection qui est en
   * réalité intacte. La page le dit dans la région d'état, avec le reste de
   * ce qu'elle annonce aux lecteurs d'écran (ADR-0005).
   *
   * Zéro tant que la liste n'a pas été chargée : pendant le chargement,
   * rien n'est masqué — tout est simplement en route, ce que la page dit
   * déjà par ailleurs.
   */
  readonly retenusMasques = computed(() => {
    const liste = this.liste();

    if (!liste?.chargee) {
      return 0;
    }

    return this.selection().length - this.biensCompares().length;
  });

  /**
   * Le libellé sous lequel un Statut s'affiche.
   *
   * L'écran ne s'en sert plus que pour nommer le filtre dans ses messages —
   * « Aucun Bien à l'étape "Visité" », et le mot dit au Bien créé qu'un autre
   * filtre le cache. Les pastilles des Biens sont désormais posées par le
   * tableau et par les cartes, chacun sur sa présentation (#11).
   */
  readonly libelleStatut = libelleStatut;

  constructor() {
    /**
     * Un seul chargement, sans filtre : la liste entière sert à la fois ce
     * que l'écran montre et ce que les pastilles comptent.
     *
     * C'est ce qui a remplacé le rechargement par Statut. Le filtre part
     * désormais en mémoire, et il n'y a plus de course entre deux réponses
     * à départager — le problème que `switchMap` résolvait ici n'existe
     * plus faute d'une seconde requête.
     */
    this.bienService.lister().subscribe((liste) => this.liste.set(liste));
  }

  /**
   * Le clic sur la case d'un Bien : il rejoint la comparaison, ou il en
   * sort.
   *
   * La règle — l'ordre d'ajout, le refus au plafond, ce que le
   * rétrécissement de la fenêtre abandonne — est dans le service, qui la
   * tient pour les trois écrans. La page n'a plus qu'à transmettre le clic,
   * et à annoncer le plafond au-dessus de sa liste.
   */
  basculerComparaison(bienId: number): void {
    this.selectionComparaison.basculer(bienId);
  }

  /**
   * Le constat qu'un Bien a été supprimé : il quitte la comparaison (#93).
   *
   * La page n'appelle pas cette méthode d'elle-même, et ne le peut pas : sa
   * liste est filtrable, et l'absence d'un Bien n'y distingue pas une
   * suppression d'un filtrage. Elle reste le point d'entrée d'un écran qui
   * supprimerait un Bien sans quitter la liste ; la suppression se joue
   * aujourd'hui sur la fiche (#9), et c'est l'écran de comparaison — qui
   * charge la liste entière — qui la constate au retour.
   */
  oublier(bienId: number): void {
    this.selectionComparaison.oublier(bienId);
  }

  /** Le bouton qui vide la comparaison, sans toucher à la liste. */
  viderComparaison(): void {
    this.selectionComparaison.vider();
  }

  /**
   * Le changement de filtre.
   *
   * Il ne recharge plus rien : la liste entière est déjà là, et c'est elle
   * qui alimente les comptes des pastilles. Filtrer en mémoire est ce qui
   * rend le geste instantané — six pastilles qu'on essaie l'une après
   * l'autre ne valent pas six allers-retours à l'API.
   */
  filtrer(statut: Statut | null): void {
    this.filtre.set(statut);
  }
}