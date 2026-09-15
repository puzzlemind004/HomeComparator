import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, switchMap } from 'rxjs';
import { RouterLink } from '@angular/router';
import { BienService, type ListeBiens } from './bien.service';
import { STATUTS, libelleStatut, type Statut } from '../criteres/statut';
import { CartesBiens } from './cartes-biens';
import { TableauBiens } from './tableau-biens';
import { SelectionComparaison } from './selection.service';
import { comparaisonPossible } from '../criteres/selection-comparaison';
import { ROUTE_COMPARAISON } from './carnet.routes';
import type { Bien } from './bien';

/**
 * L'écran de repérage : saisir un Libellé, et retrouver le Bien dans la
 * liste. Le geste doit tenir en quelques secondes (ADR-0008), donc le
 * formulaire ne demande rien d'autre — l'URL de l'Annonce reste facultative.
 */
@Component({
  selector: 'app-biens-page',
  imports: [CartesBiens, FormsModule, RouterLink, TableauBiens],
  styleUrl: './biens-page.scss',
  templateUrl: './biens-page.html',
})
export class BiensPage {
  private readonly bienService = inject(BienService);
  private readonly selectionComparaison = inject(SelectionComparaison);

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

  private rafraichir(): void {
    this.chargements.next(this.filtre());
  }
}
