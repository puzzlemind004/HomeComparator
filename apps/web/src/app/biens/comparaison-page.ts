import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subject, switchMap } from 'rxjs';
import { BienService, type ListeBiens } from './bien.service';
import { ComparaisonBiens } from './comparaison-biens';
import { SelectionComparaison } from './selection.service';
import { ROUTE_BIENS } from './carnet.routes';

/**
 * L'écran du face-à-face (#124).
 *
 * Le face-à-face était une section du carnet, sous la liste et visible
 * seulement une fois deux Biens cochés. C'est pourtant l'objet du produit —
 * « mettre plusieurs logements côte à côte » (`CONTEXT.md`) —, et rien à
 * l'écran ne disait qu'il existait avant qu'on l'ait déclenché par accident.
 * Il a donc sa route, atteignable **sans avoir rien coché** : c'est ce qui
 * permet à la navigation de l'annoncer en permanence.
 *
 * L'écran vide n'est donc pas un cas dégradé mais le premier qu'on voit : il
 * dit ce qu'il attend et renvoie au carnet, plutôt que de paraître cassé.
 *
 * **La comparaison elle-même n'est pas ici** : elle est dans
 * `comparaison-biens`, inchangé. Cette page tient ce qui vient de l'entourer
 * — quels Biens, dans quel état, et quoi dire quand il n'y en a pas assez.
 */
@Component({
  selector: 'app-comparaison-page',
  imports: [ComparaisonBiens, RouterLink],
  styleUrl: './comparaison-page.scss',
  templateUrl: './comparaison-page.html',
})
export class ComparaisonPage {
  private readonly bienService = inject(BienService);
  private readonly selectionComparaison = inject(SelectionComparaison);

  /** Le retour au carnet, seul endroit où la sélection se fait. */
  readonly routeBiens = ROUTE_BIENS;

  /**
   * Les Biens du carnet, **sans filtre**.
   *
   * L'écran ne propose pas de filtrer : il ne montre que ce qui est retenu,
   * et filtrer une comparaison de deux à quatre colonnes n'aurait rien à
   * retrancher qu'on n'ait explicitement demandé. C'est ce qui rend
   * l'absence lisible ici — voir `rafraichir`.
   */
  readonly liste = signal<ListeBiens | null>(null);

  /** Ce qui reste de la sélection, pour le gabarit et pour le bouton. */
  readonly selection = this.selectionComparaison.selection;
  readonly minimum = this.selectionComparaison.minimum;
  readonly maximum = this.selectionComparaison.maximum;

  /** Vrai une fois la liste reçue, quelle qu'elle soit. */
  readonly chargee = computed(() => this.liste()?.chargee === true);

  /**
   * Les Biens à comparer, dans l'ordre de la sélection et non dans celui de
   * la liste : c'est l'ordre que l'acheteur a demandé, et le seul qui ne
   * fasse pas bouger les colonnes déjà posées quand il en ajoute une.
   */
  readonly biensCompares = computed(() => {
    const liste = this.liste();
    const biens = liste?.chargee ? liste.biens : [];

    return this.selection()
      .map((bienId) => biens.find((bien) => bien.id === bienId))
      .filter((bien) => bien !== undefined);
  });

  /** Vrai dès qu'il y a deux colonnes à mettre côte à côte. */
  readonly comparaisonAffichee = computed(() => this.biensCompares().length >= this.minimum);

  /**
   * Combien de Biens il reste à choisir pour qu'il y ait quelque chose à
   * comparer.
   *
   * L'écran vide le dit en toutes lettres — « choisissez-en deux » — plutôt
   * que d'afficher un tableau sans colonnes. C'est ce que demande le critère
   * d'acceptation de #124 : la comparaison s'atteint sans avoir coché quoi
   * que ce soit, **et dit ce qu'elle attend**.
   */
  readonly manquants = computed(() => Math.max(0, this.minimum - this.biensCompares().length));

  /**
   * Les chargements demandés. Ils passent par un sujet plutôt que par un
   * `subscribe` direct pour que `switchMap` abandonne la requête précédente,
   * comme sur le carnet : deux retours rapprochés sur cet écran lancent deux
   * appels, et rien ne garantit qu'ils reviennent dans l'ordre.
   */
  private readonly chargements = new Subject<void>();

  constructor() {
    this.chargements.pipe(switchMap(() => this.bienService.lister())).subscribe((liste) => {
      this.liste.set(liste);
      this.oublierLesDisparus(liste);
    });

    this.rafraichir();
  }

  /** Le bouton qui vide la comparaison, sans toucher au carnet. */
  vider(): void {
    this.selectionComparaison.vider();
  }

  rafraichir(): void {
    this.chargements.next();
  }

  /**
   * Les Biens retenus que la liste ne rend plus : ils ont été supprimés, et
   * sortent de la sélection (#93).
   *
   * **C'est ici et nulle part ailleurs** que l'absence vaut disparition,
   * parce que cet écran-ci charge la liste entière : rien n'y est filtré,
   * donc un Bien qui manque manque pour de bon. Le carnet, lui, ne peut pas
   * en conclure autant — un Statut filtré masque des Biens qui existent, et
   * c'est précisément la confusion que #93 a défaite. La suppression se joue
   * sur la fiche du Bien, qui est un troisième écran ; au retour, c'est ce
   * rafraîchissement qui la constate.
   *
   * Une liste non chargée ne dit rien : une API muette n'est pas une
   * suppression, et vider la sélection sur son silence perdrait un
   * face-à-face que le rechargement suivant rendrait intact.
   */
  private oublierLesDisparus(liste: ListeBiens): void {
    if (!liste.chargee) {
      return;
    }

    const presents = new Set(liste.biens.map((bien) => bien.id));

    for (const bienId of this.selection()) {
      if (!presents.has(bienId)) {
        this.selectionComparaison.oublier(bienId);
      }
    }
  }
}
