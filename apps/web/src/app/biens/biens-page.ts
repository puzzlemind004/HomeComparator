import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, switchMap } from 'rxjs';
import { BienService, type ListeBiens } from './bien.service';
import { ExportService, type FormatExport } from './export.service';
import { STATUTS, libelleStatut, type Statut } from '../criteres/statut';
import { CartesBiens } from './cartes-biens';
import { ComparaisonBiens } from './comparaison-biens';
import { TableauBiens } from './tableau-biens';
import { LargeurEcran } from '../criteres/largeur-ecran';
import {
  MINIMUM_COMPARAISON,
  basculerSelection,
  comparaisonPossible,
  selectionAjustee,
} from '../criteres/selection-comparaison';
import type { Bien } from './bien';

/**
 * L'écran de repérage : saisir un Libellé, et retrouver le Bien dans la
 * liste. Le geste doit tenir en quelques secondes (ADR-0008), donc le
 * formulaire ne demande rien d'autre — l'URL de l'Annonce reste facultative.
 */
@Component({
  selector: 'app-biens-page',
  imports: [CartesBiens, ComparaisonBiens, FormsModule, TableauBiens],
  styleUrl: './biens-page.scss',
  templateUrl: './biens-page.html',
})
export class BiensPage {
  private readonly bienService = inject(BienService);
  private readonly exportService = inject(ExportService);
  private readonly largeurEcran = inject(LargeurEcran);

  /**
   * L'état lu par le gabarit. Il est public plutôt que `protected` pour
   * rester lisible par les tests, qui l'interrogent là où ils devraient
   * sinon inspecter le DOM rendu.
   */
  readonly libelle = signal('');
  readonly urlAnnonce = signal('');

  /**
   * La liste, ou l'aveu qu'on n'a pas pu la charger. `null` tant que l'API
   * n'a pas répondu : les trois états sont distincts à l'écran, une liste
   * vide ne devant jamais être confondue avec un chargement raté.
   */
  readonly liste = signal<ListeBiens | null>(null);
  readonly erreurs = signal<string[]>([]);
  readonly enregistrement = signal(false);

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
   * Ce que l'écran a à dire sur le dernier Bien créé, quand la liste ne
   * suffit pas à le montrer.
   *
   * Un Bien créé est « À contacter » (#7). Si la liste est filtrée sur un
   * autre Statut, il n'y a pas sa place — et sans un mot, l'enregistrement
   * réussi serait indiscernable d'un échec : le formulaire se vide, la
   * liste ne bouge pas. L'acheteur ressaisirait, et créerait un doublon.
   */
  readonly message = signal<string | null>(null);

  /**
   * Le format dont l'export est en cours, ou `null` si aucun ne l'est
   * (#14).
   *
   * Un format plutôt qu'un booléen : il dit lequel des deux boutons
   * travaille, et un carnet bien rempli met un instant à sortir. Sans lui,
   * l'acheteur ne saurait pas si son clic a été pris en compte, et
   * cliquerait à nouveau.
   */
  readonly export = signal<FormatExport | null>(null);

  /**
   * Ce qui a empêché le dernier export, ou `null`.
   *
   * Un échec d'export se dit, et c'est tout l'objet de ce signal : sans
   * message, l'acheteur croirait tenir une copie de son carnet alors que
   * rien n'a été produit — et ne s'en apercevrait que le jour où il en
   * aurait besoin, qui est le pire moment (ADR-0007).
   *
   * Une réussite, elle, ne dit rien : le navigateur a déjà annoncé le
   * téléchargement, et un message de plus ferait du bruit pour une chose
   * déjà dite.
   */
  readonly erreurExport = signal<string | null>(null);

  /**
   * Les Biens retenus pour le face-à-face (#12), dans l'ordre où l'acheteur
   * les a choisis — c'est cet ordre qui fixe celui des colonnes.
   *
   * La sélection vit ici et non dans le tableau ou les cartes : les deux
   * présentations la montrent, et deux états séparés divergeraient dès qu'une
   * fenêtre redimensionnée fait passer de l'une à l'autre. Elle ne se retient
   * pas d'une visite à l'autre — le carnet ne persiste aucune préférence.
   */
  private readonly choix = signal<readonly number[]>([]);

  /**
   * Les Biens dont on sait qu'ils ont **cessé d'exister** (#93).
   *
   * Il faut ce signal parce que l'absence d'un Bien de la liste ne dit pas
   * pourquoi il n'y est pas : la liste chargée porte de la même façon un
   * Bien supprimé et un Bien qu'un filtre par Statut ne montre pas. Or les
   * deux n'appellent pas la même réponse — le premier doit quitter la
   * comparaison pour de bon, le second garder sa place.
   *
   * La disparition se **déclare** donc, par `oublier`, plutôt que de se
   * déduire d'une liste. Un identifiant y entre quand la suppression est
   * constatée, et rien d'autre ne l'y met : c'est ce qui interdit à un
   * filtrage de se faire passer pour une suppression.
   *
   * Il grandit sans jamais rétrécir, ce qui est sans conséquence : un Bien
   * supprimé ne revient pas, et la page ne vit que le temps d'une visite.
   */
  private readonly oublies = signal<readonly number[]>([]);

  /** Combien de Biens l'écran courant permet de comparer (ADR-0006). */
  readonly maximumSelection = computed(() => this.largeurEcran.maximumComparaison());

  /** Ce qu'il faut de Biens pour qu'il y ait quelque chose à comparer. */
  readonly minimumComparaison = MINIMUM_COMPARAISON;

  /**
   * La sélection telle que l'écran peut réellement l'honorer : ce que
   * l'acheteur a coché, ramené au plafond et aux Biens qui existent encore.
   *
   * Elle est **dérivée** et non écrite, là où un `effect` qui corrigerait le
   * signal aurait fait la même chose : deux choses la rendent caduque sans
   * qu'on y touche — la fenêtre qui rétrécit sous le seuil, et un Bien
   * supprimé. Un état corrigé après coup existe brièvement faux, et cette
   * page-là se lirait avec une colonne dont elle n'a plus les valeurs.
   *
   * Ce dont elle ne dépend **pas** : la liste affichée. Un filtre par Statut
   * est un geste de lecture, et un Bien qu'il masque reste retenu (#93) —
   * il garde sa place, compte sous le plafond, et revient tel quel à
   * l'ouverture du filtre. C'est `biensCompares` qui s'occupe de ne pas lui
   * faire de colonne tant que l'écran n'a pas ses valeurs.
   *
   * Rétrécir la fenêtre puis l'élargir rend les Biens que le plafond avait
   * mis de côté, tant qu'aucun clic n'est venu entre-temps : le premier
   * geste de sélection repart de ce qui est réellement comparé, et ce qui
   * dépassait est alors abandonné pour de bon. Retenir indéfiniment des
   * colonnes invisibles ferait resurgir, à l'élargissement, des Biens que
   * l'acheteur croyait avoir remplacés.
   */
  readonly selection = computed<readonly number[]>(() =>
    selectionAjustee(this.choix(), this.maximumSelection(), this.oublies()),
  );

  /**
   * Vrai dès que deux Biens **comparables** sont retenus : la vue a alors de
   * quoi s'afficher.
   *
   * Elle se lit sur `biensCompares` et non sur `selection`, dont les deux
   * peuvent différer depuis #93 : un Bien retenu que le filtre masque garde
   * sa place, mais l'écran n'a pas ses valeurs. Compter sur la sélection
   * ferait paraître un face-à-face à une seule colonne, qui ne compare rien.
   */
  readonly comparaisonAffichee = computed(() => comparaisonPossible(this.biensCompares()));

  /**
   * Vrai quand le plafond est atteint : la page le dit au-dessus de la
   * liste, plutôt que de laisser l'acheteur découvrir des cases qui ne
   * répondent plus sans savoir pourquoi.
   */
  readonly selectionPleine = computed(() => this.selection().length >= this.maximumSelection());

  /**
   * Les Biens à comparer, dans l'ordre de la sélection et non dans celui de
   * la liste : c'est l'ordre que l'acheteur a demandé, et le seul qui ne
   * fasse pas bouger les colonnes déjà posées quand il en ajoute une.
   */
  readonly biensCompares = computed<Bien[]>(() => {
    const liste = this.liste();
    const biens = liste?.chargee ? liste.biens : [];

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

  /**
   * Les chargements demandés, un par changement de filtre.
   *
   * Ils passent par un sujet plutôt que par un `subscribe` direct pour que
   * `switchMap` abandonne la requête précédente : deux clics rapprochés
   * lancent deux appels, et rien ne garantit qu'ils reviennent dans
   * l'ordre. Sans cela, la réponse la plus lente écrase la plus récente, et
   * l'écran montre les Biens d'un Statut sous la pastille d'un autre.
   */
  private readonly chargements = new Subject<Statut | null>();

  constructor() {
    this.chargements
      .pipe(switchMap((statut) => this.bienService.lister(statut ?? undefined)))
      .subscribe((liste) => this.liste.set(liste));

    this.rafraichir();
  }

  /**
   * Le clic sur la case d'un Bien : il rejoint la comparaison, ou il en
   * sort.
   *
   * Au plafond, l'ajout est refusé et la sélection ne bouge pas — c'est ce
   * que dit `basculerSelection`, et la page l'annonce au-dessus de la liste.
   */
  basculerComparaison(bienId: number): void {
    // La bascule repart de la sélection **effective** et non du choix brut :
    // un Bien coché au bureau puis écarté par le rétrécissement de la
    // fenêtre ne doit pas occuper une place sur le téléphone. Ce que le
    // plafond a mis de côté est donc abandonné pour de bon au clic suivant,
    // et c'est voulu — la place n'existe pas, et retenir indéfiniment des
    // colonnes invisibles les ferait resurgir à l'élargissement, longtemps
    // après le geste qui les a choisies.
    //
    // Ce que la sélection effective ne retranche **plus** : les Biens qu'un
    // filtre par Statut masque (#93). Un filtre est un geste de lecture, pas
    // une décision sur la comparaison, et rien à l'écran n'annonce qu'en
    // filtrant on renonce à ce qu'on avait retenu. Le Bien masqué existe, il
    // est comparable, il est seulement hors du filtre courant : il garde sa
    // place ici et revient tel quel quand le filtre s'ouvre.
    //
    // Les deux causes de retrait sont donc séparées, et c'est `oublies` qui
    // porte la seconde : seule une suppression constatée écarte pour de bon.
    this.choix.update(() => basculerSelection(this.selection(), bienId, this.maximumSelection()));
  }

  /**
   * Le constat qu'un Bien a été supprimé : il quitte la comparaison et n'y
   * revient pas (#93).
   *
   * C'est le seul chemin par lequel un Bien sort de la sélection sans que
   * l'acheteur l'ait décoché ni que le plafond s'en mêle. Il se **déclare**
   * plutôt que de se déduire de l'absence du Bien dans la liste : cette
   * absence-là ne distingue pas une suppression d'un filtrage, et c'est
   * précisément la confusion que ce ticket défait.
   *
   * La suppression elle-même se joue sur la fiche du Bien (#9), qui est un
   * autre écran : la page y navigue et se reconstruit au retour, sélection
   * comprise. Cette méthode est donc aujourd'hui sans appelant dans
   * l'application — elle est le point d'entrée que devra emprunter tout
   * écran qui supprimerait un Bien sans quitter la liste, et sans lequel il
   * n'aurait d'autre recours que de reconclure « supprimé » d'une liste
   * filtrée.
   */
  oublier(bienId: number): void {
    this.oublies.update((oublies) => (oublies.includes(bienId) ? oublies : [...oublies, bienId]));
  }

  /** Le bouton qui vide la comparaison, sans toucher à la liste. */
  viderComparaison(): void {
    this.choix.set([]);
  }

  /**
   * Le changement de filtre, qui relance le chargement.
   *
   * La liste est rechargée plutôt que filtrée en mémoire : le filtre est en
   * SQL (ADR-0004), et l'écran ne détient de toute façon que ce que le
   * filtre précédent lui a rendu.
   */
  filtrer(statut: Statut | null): void {
    this.filtre.set(statut);
    this.liste.set(null);
    this.message.set(null);
    this.rafraichir();
  }

  creer(): void {
    if (this.enregistrement()) {
      return;
    }

    this.enregistrement.set(true);
    this.erreurs.set([]);
    this.message.set(null);

    this.bienService
      .creer({ libelle: this.libelle(), urlAnnonce: this.urlAnnonce() })
      .subscribe((resultat) => {
        this.enregistrement.set(false);

        if (!resultat.cree) {
          this.erreurs.set(resultat.erreurs);
          return;
        }

        /**
         * Le Bien créé rejoint la liste sans nouvel aller-retour : il
         * apparaît immédiatement, ce qui est tout l'objet de l'écran.
         *
         * Sauf si la liste est filtrée sur un autre Statut que le sien : un
         * Bien créé est « À contacter » (#7), et l'ajouter à une liste
         * « Visité » y ferait figurer un Bien que le filtre exclut. L'écran
         * le dit alors, plutôt que de ne rien faire — un enregistrement
         * réussi et un échec se ressembleraient sinon trait pour trait, et
         * l'acheteur ressaisirait un Bien déjà en base.
         */
        const filtre = this.filtre();
        const aSaPlace = filtre === null || filtre === resultat.bien.statut;

        if (aSaPlace) {
          this.liste.update((liste) =>
            liste?.chargee ? { chargee: true, biens: [resultat.bien, ...liste.biens] } : liste,
          );
        } else {
          this.message.set(
            `« ${resultat.bien.libelle} » est enregistré, à l'étape « ${libelleStatut(
              resultat.bien.statut,
            )} ». Le filtre courant ne le montre pas.`,
          );
        }

        this.libelle.set('');
        this.urlAnnonce.set('');
      });
  }

  /**
   * L'export du carnet dans le format demandé (#14).
   *
   * L'écran ne fabrique pas le fichier : c'est l'API qui le rend tout écrit,
   * et le service qui déclenche l'enregistrement. Ce qui se décide ici est
   * ce que l'acheteur voit pendant et après — le bouton qui travaille, et
   * le message quand rien n'est sorti.
   *
   * Un second clic est ignoré tant que le premier n'a pas rendu : deux
   * demandes impatientes produiraient deux téléchargements du même carnet.
   * C'est le même garde que l'enregistrement d'un Bien.
   */
  exporter(format: FormatExport): void {
    if (this.export()) {
      return;
    }

    this.export.set(format);
    // L'échec précédent s'efface : le laisser afficher pendant la nouvelle
    // tentative ferait lire l'échec d'hier comme celui d'aujourd'hui.
    this.erreurExport.set(null);

    this.exportService.exporter(format).subscribe((resultat) => {
      this.export.set(null);

      if (!resultat.exporte) {
        this.erreurExport.set(resultat.erreur);
      }
    });
  }

  private rafraichir(): void {
    this.chargements.next(this.filtre());
  }
}
