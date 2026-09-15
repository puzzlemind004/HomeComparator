import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { of } from 'rxjs';
import { CarrouselCommentaires } from './carrousel-commentaires';
import {
  CommentaireService,
  type Commentaires,
  type SuppressionCommentaireResultat,
} from './commentaire.service';
import type { Commentaire } from './commentaire';
import { routeCommenterBien } from './carnet.routes';

function commentaire(id: number, surcharges: Partial<Commentaire> = {}): Commentaire {
  return {
    id,
    texte: `commentaire ${id}`,
    photo: null,
    note: null,
    date: '11/09/2026 12:30',
    ...surcharges,
  };
}

/**
 * Le carrousel est construit sans TestBed, comme les autres écrans : le
 * service est doublé par un Injector nu, et les assertions portent sur ce que
 * le composant tient plutôt que sur le DOM rendu.
 */
function creerCarrousel(service: Partial<CommentaireService>, bienId = 1) {
  const injector = Injector.create({
    providers: [{ provide: CommentaireService, useValue: service }],
  });

  const carrousel = runInInjectionContext(injector, () => new CarrouselCommentaires());

  // L'`@Input` déclenche le chargement, comme le ferait la liaison du parent.
  carrousel.bien = bienId;

  return carrousel;
}

const troisCommentaires = () => ({
  lister: () =>
    of<Commentaires>({
      chargee: true,
      commentaires: [commentaire(1), commentaire(2), commentaire(3)],
    }),
});

describe('CarrouselCommentaires', () => {
  describe('chargement', () => {
    it('ouvre sur le premier de la liste, le plus récent', () => {
      // C'est celui qu'on vient d'écrire qu'on relit, et celui de la dernière
      // visite qu'on cherche en rouvrant une fiche.
      const carrousel = creerCarrousel(troisCommentaires());

      expect(carrousel.nombre()).toBe(3);
      expect(carrousel.courant()?.id).toBe(1);
    });

    it('distingue une API injoignable d’un Bien sans Commentaire', () => {
      const carrousel = creerCarrousel({ lister: () => of<Commentaires>({ chargee: false }) });

      expect(carrousel.chargee()).toBe(false);
      expect(carrousel.courant()).toBeUndefined();
    });

    it('mène à l’écran de saisie du Bien affiché', () => {
      const carrousel = creerCarrousel(troisCommentaires(), 12);

      expect(carrousel.routeCommenter()).toBe(routeCommenterBien(12));
    });
  });

  describe('feuilletage', () => {
    it('avance et recule d’un Commentaire', () => {
      const carrousel = creerCarrousel(troisCommentaires());

      carrousel.suivant();
      expect(carrousel.courant()?.id).toBe(2);

      carrousel.precedent();
      expect(carrousel.courant()?.id).toBe(1);
    });

    it('boucle dans les deux sens', () => {
      // Buter sur un bouton inerte obligerait à autant d'appuis en arrière
      // qu'il y a d'observations pour revenir au début.
      const carrousel = creerCarrousel(troisCommentaires());

      carrousel.precedent();
      expect(carrousel.courant()?.id).toBe(3);

      carrousel.suivant();
      expect(carrousel.courant()?.id).toBe(1);
    });

    it('mène directement à un rang, comme les pastilles', () => {
      const carrousel = creerCarrousel(troisCommentaires());

      carrousel.aller(2);
      expect(carrousel.courant()?.id).toBe(3);
    });

    it('ignore un rang qui n’existe pas', () => {
      const carrousel = creerCarrousel(troisCommentaires());

      carrousel.aller(9);
      expect(carrousel.courant()?.id).toBe(1);
    });

    it('ne bouge pas quand il n’y a rien à feuilleter', () => {
      const carrousel = creerCarrousel({
        lister: () => of<Commentaires>({ chargee: true, commentaires: [] }),
      });

      carrousel.suivant();
      carrousel.precedent();

      expect(carrousel.courant()).toBeUndefined();
    });
  });

  describe('suppression', () => {
    it('ne supprime rien sans confirmation', () => {
      // Le garde-fou vit dans le composant et non dans le seul gabarit : un
      // remaniement du HTML ne doit pas pouvoir le faire disparaître.
      let appelee = false;
      const carrousel = creerCarrousel({
        ...troisCommentaires(),
        supprimer: () => {
          appelee = true;
          return of<SuppressionCommentaireResultat>({ supprime: true });
        },
      });

      carrousel.supprimer();

      expect(appelee).toBe(false);
      expect(carrousel.nombre()).toBe(3);
    });

    it('retire le Commentaire une fois confirmé', () => {
      const carrousel = creerCarrousel({
        ...troisCommentaires(),
        supprimer: () => of<SuppressionCommentaireResultat>({ supprime: true }),
      });

      carrousel.demanderSuppression(commentaire(1));
      carrousel.supprimer();

      expect(carrousel.nombre()).toBe(2);
      expect(carrousel.courant()?.id).toBe(2);
      expect(carrousel.confirmation()).toBeNull();
    });

    it('ramène le feuilletage dans la liste raccourcie', () => {
      // Supprimer le dernier laisserait sinon le carrousel sur un rang qui
      // n'existe plus, donc sur une case vide.
      const carrousel = creerCarrousel({
        ...troisCommentaires(),
        supprimer: () => of<SuppressionCommentaireResultat>({ supprime: true }),
      });

      carrousel.aller(2);
      carrousel.demanderSuppression(commentaire(3));
      carrousel.supprimer();

      expect(carrousel.courant()?.id).toBe(2);
    });

    it('retire un Commentaire déjà parti sans crier à l’erreur', () => {
      const carrousel = creerCarrousel({
        ...troisCommentaires(),
        supprimer: () =>
          of<SuppressionCommentaireResultat>({ supprime: false, disparu: true, erreurs: [] }),
      });

      carrousel.demanderSuppression(commentaire(1));
      carrousel.supprimer();

      expect(carrousel.nombre()).toBe(2);
      expect(carrousel.erreurs()).toEqual([]);
    });

    it('laisse la confirmation ouverte quand la suppression échoue', () => {
      // Le Commentaire est toujours là, et le geste à refaire est celui-là
      // même.
      const carrousel = creerCarrousel({
        ...troisCommentaires(),
        supprimer: () =>
          of<SuppressionCommentaireResultat>({
            supprime: false,
            disparu: false,
            erreurs: ["L'API est injoignable."],
          }),
      });

      carrousel.demanderSuppression(commentaire(1));
      carrousel.supprimer();

      expect(carrousel.nombre()).toBe(3);
      expect(carrousel.confirmation()).not.toBeNull();
      expect(carrousel.erreurs()).toEqual(["L'API est injoignable."]);
    });

    it('renonce sans rien appeler', () => {
      let appelee = false;
      const carrousel = creerCarrousel({
        ...troisCommentaires(),
        supprimer: () => {
          appelee = true;
          return of<SuppressionCommentaireResultat>({ supprime: true });
        },
      });

      carrousel.demanderSuppression(commentaire(1));
      carrousel.annulerSuppression();
      carrousel.supprimer();

      expect(appelee).toBe(false);
      expect(carrousel.nombre()).toBe(3);
    });
  });
});
