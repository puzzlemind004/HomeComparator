import { Component, Input, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommentaireService } from './commentaire.service';
import { ETOILES, type Commentaire } from './commentaire';
import { routeCommenterBien } from './carnet.routes';

/**
 * Les Commentaires d'un Bien, en bas de sa fiche.
 *
 * Un carrousel et non une liste déroulante : les Commentaires portent des
 * photos, et une pile de vingt clichés pleine largeur rendrait la fin de la
 * fiche interminable. On en regarde un à la fois, comme on les a pris — un
 * par pièce, un par détail.
 *
 * **Le plus récent d'abord.** C'est celui qu'on vient d'écrire qu'on relit,
 * et celui de la dernière visite qu'on cherche en rouvrant une fiche.
 */
@Component({
  selector: 'app-carrousel-commentaires',
  imports: [RouterLink],
  templateUrl: './carrousel-commentaires.html',
  styleUrl: './carrousel-commentaires.scss',
})
export class CarrouselCommentaires {
  private readonly commentaireService = inject(CommentaireService);

  private bienId!: number;

  @Input({ required: true })
  set bien(id: number) {
    this.bienId = id;
    this.routeCommenter.set(routeCommenterBien(id));
    this.charger();
  }

  readonly commentaires = signal<Commentaire[]>([]);

  /**
   * L'API injoignable est un état à afficher et non un Bien sans
   * Commentaire : dire « aucun Commentaire » d'un Bien qui en a se lirait
   * comme des observations perdues, qu'on ne réécrira pas.
   */
  readonly chargee = signal(false);

  readonly erreurs = signal<string[]>([]);
  readonly suppression = signal(false);

  /** Où mène « Commenter » : l'écran de saisie de ce Bien. */
  readonly routeCommenter = signal('');

  /**
   * Le Commentaire affiché, par son rang dans la liste.
   *
   * Un index et non le Commentaire lui-même : c'est la position qui avance
   * et recule, et garder l'objet obligerait à le retrouver dans la liste à
   * chaque pas — et à décider quoi faire quand il vient d'être supprimé.
   */
  readonly position = signal(0);

  /** Le Commentaire à l'écran, ou `undefined` quand il n'y en a aucun. */
  readonly courant = computed<Commentaire | undefined>(
    () => this.commentaires()[this.position()],
  );

  readonly nombre = computed(() => this.commentaires().length);

  /** Les cinq étoiles, que le gabarit allume ou éteint une à une. */
  readonly etoiles = ETOILES;

  /** Le Commentaire dont la suppression attend confirmation. */
  readonly confirmation = signal<Commentaire | null>(null);

  private charger(): void {
    this.commentaireService.lister(this.bienId).subscribe((resultat) => {
      this.chargee.set(resultat.chargee);
      this.commentaires.set(resultat.chargee ? resultat.commentaires : []);
      this.position.set(0);
    });
  }

  /**
   * Le Commentaire suivant, et le précédent.
   *
   * Le parcours **boucle** : le dernier ramène au premier. Une pile de dix
   * observations se feuillette au pouce, et buter sur un bouton inerte
   * obligerait à dix appuis en arrière pour revenir au début.
   */
  suivant(): void {
    if (this.nombre()) {
      this.position.update((rang) => (rang + 1) % this.nombre());
    }
  }

  precedent(): void {
    if (this.nombre()) {
      this.position.update((rang) => (rang - 1 + this.nombre()) % this.nombre());
    }
  }

  /** Le Commentaire d'un rang précis, où mènent les pastilles. */
  aller(rang: number): void {
    if (rang >= 0 && rang < this.nombre()) {
      this.position.set(rang);
    }
  }

  /**
   * La suppression se confirme, comme celle d'une photo : il n'y a ni
   * corbeille ni restauration (ADR-0007), et une observation prise sur
   * place ne se réécrit pas de mémoire.
   */
  demanderSuppression(commentaire: Commentaire): void {
    this.erreurs.set([]);
    this.confirmation.set(commentaire);
  }

  annulerSuppression(): void {
    this.confirmation.set(null);
  }

  supprimer(): void {
    const commentaire = this.confirmation();

    if (!commentaire || this.suppression()) {
      return;
    }

    this.suppression.set(true);
    this.erreurs.set([]);

    this.commentaireService.supprimer(this.bienId, commentaire.id).subscribe((resultat) => {
      this.suppression.set(false);

      if (resultat.supprime || resultat.disparu) {
        this.commentaires.update((liste) => liste.filter(({ id }) => id !== commentaire.id));
        this.confirmation.set(null);

        /**
         * La position est ramenée dans la liste raccourcie : supprimer le
         * dernier laisserait sinon le carrousel sur un rang qui n'existe
         * plus, donc sur une case vide au lieu du Commentaire précédent.
         */
        this.position.update((rang) => Math.max(0, Math.min(rang, this.nombre() - 1)));

        return;
      }

      // L'échec laisse la confirmation ouverte : le Commentaire est
      // toujours là, et le geste à refaire est celui-là même.
      this.erreurs.set(resultat.erreurs);
    });
  }
}
