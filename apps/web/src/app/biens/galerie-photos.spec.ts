import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { of } from 'rxjs';
import { GaleriePhotos } from './galerie-photos';
import { PhotoService, type AjoutPhotosResultat, type Galerie } from './photo.service';
import type { SuppressionPhotoResultat } from './photo.service';
import type { Photo } from './photo';

function photo(id: number): Photo {
  return {
    id,
    url: `/api/biens/1/photos/${id}`,
    urlVignette: `/api/biens/1/photos/${id}?taille=vignette`,
  };
}

/**
 * La galerie est construite sans TestBed, comme les autres écrans : le
 * service est doublé par un Injector nu, et les assertions portent sur ce
 * que le composant tient plutôt que sur le DOM rendu.
 */
function creerGalerie(service: Partial<PhotoService>, bienId = 1) {
  const injector = Injector.create({ providers: [{ provide: PhotoService, useValue: service }] });

  const galerie = runInInjectionContext(injector, () => new GaleriePhotos());

  // L'`@Input` déclenche le chargement, comme le ferait la liaison du parent.
  galerie.bien = bienId;

  return galerie;
}

/** Un événement de champ de fichiers, tel que le navigateur le produit. */
function choixDe(fichiers: File[]): Event {
  const champ = { files: fichiers, value: 'C:\\faux\\salon.jpg' } as unknown as HTMLInputElement;

  return { target: champ } as unknown as Event;
}

const unFichier = () => new File(['a'], 'salon.jpg', { type: 'image/jpeg' });

describe('GaleriePhotos', () => {
  describe('chargement', () => {
    it('tient les photos rendues par l’API', () => {
      const galerie = creerGalerie({
        lister: () => of<Galerie>({ chargee: true, photos: [photo(1), photo(2)] }),
      });

      expect(galerie.chargee()).toBe(true);
      expect(galerie.photos()).toHaveLength(2);
    });

    it('distingue l’API injoignable d’un Bien sans photo', () => {
      // Dire « aucune photo » d'un Bien qui en a se lirait comme des
      // fichiers perdus, qu'on ne repassera pas prendre.
      const galerie = creerGalerie({ lister: () => of<Galerie>({ chargee: false }) });

      expect(galerie.chargee()).toBe(false);
      expect(galerie.photos()).toEqual([]);
    });
  });

  describe('ajout', () => {
    it('ajoute les photos envoyées à la suite des précédentes', () => {
      // Un second envoi se range derrière le premier : on revient
      // photographier après coup, et l'ordre ne doit pas s'en trouver rebattu.
      const galerie = creerGalerie({
        lister: () => of<Galerie>({ chargee: true, photos: [photo(1)] }),
        ajouter: () => of<AjoutPhotosResultat>({ ajoutees: true, photos: [photo(2)] }),
      });

      galerie.choisir(choixDe([unFichier()]));

      expect(galerie.photos().map(({ id }) => id)).toEqual([1, 2]);
      expect(galerie.envoi()).toBe(false);
    });

    it('vide le champ pour qu’un même fichier puisse être renvoyé', () => {
      /**
       * Sans cela, choisir à nouveau le même fichier ne déclencherait aucun
       * événement — le navigateur ne signale qu'un changement de valeur —, et
       * l'acheteur croirait son envoi perdu.
       */
      const galerie = creerGalerie({
        lister: () => of<Galerie>({ chargee: true, photos: [] }),
        ajouter: () => of<AjoutPhotosResultat>({ ajoutees: true, photos: [photo(1)] }),
      });

      const evenement = choixDe([unFichier()]);
      galerie.choisir(evenement);

      expect((evenement.target as HTMLInputElement).value).toBe('');
    });

    it('affiche le refus de l’API sans rien ajouter', () => {
      const galerie = creerGalerie({
        lister: () => of<Galerie>({ chargee: true, photos: [] }),
        ajouter: () =>
          of<AjoutPhotosResultat>({
            ajoutees: false,
            erreurs: ['« compromis.pdf » n’est pas une image (jpg, jpeg, png, webp)'],
          }),
      });

      galerie.choisir(choixDe([unFichier()]));

      expect(galerie.photos()).toEqual([]);
      expect(galerie.erreurs()[0]).toContain('compromis.pdf');
    });

    it('n’envoie rien quand aucun fichier n’a été choisi', () => {
      let appels = 0;
      const galerie = creerGalerie({
        lister: () => of<Galerie>({ chargee: true, photos: [] }),
        ajouter: () => {
          appels += 1;
          return of<AjoutPhotosResultat>({ ajoutees: true, photos: [] });
        },
      });

      galerie.choisir(choixDe([]));

      expect(appels).toBe(0);
    });
  });

  describe('suppression', () => {
    it('retire la photo supprimée de la galerie', () => {
      const galerie = creerGalerie({
        lister: () => of<Galerie>({ chargee: true, photos: [photo(1), photo(2)] }),
        supprimer: () => of<SuppressionPhotoResultat>({ supprimee: true }),
      });

      galerie.demanderSuppression(photo(1));
      galerie.supprimer();

      expect(galerie.photos().map(({ id }) => id)).toEqual([2]);
      expect(galerie.confirmation()).toBeNull();
    });

    it('exige la confirmation avant de supprimer', () => {
      // Il n'y a ni corbeille ni restauration (ADR-0007) : une photo de
      // visite ne se reprend pas, et un appui isolé ne doit pas la perdre.
      let appels = 0;
      const galerie = creerGalerie({
        lister: () => of<Galerie>({ chargee: true, photos: [photo(1)] }),
        supprimer: () => {
          appels += 1;
          return of<SuppressionPhotoResultat>({ supprimee: true });
        },
      });

      galerie.supprimer();

      expect(appels).toBe(0);
      expect(galerie.photos()).toHaveLength(1);
    });

    it('retire aussi la photo que l’API dit déjà disparue', () => {
      // L'état visé est atteint : l'écran peut la retirer sans mentir.
      const galerie = creerGalerie({
        lister: () => of<Galerie>({ chargee: true, photos: [photo(1)] }),
        supprimer: () =>
          of<SuppressionPhotoResultat>({ supprimee: false, disparue: true, erreurs: [] }),
      });

      galerie.demanderSuppression(photo(1));
      galerie.supprimer();

      expect(galerie.photos()).toEqual([]);
    });

    it('laisse la confirmation ouverte quand la suppression a échoué', () => {
      // La photo est toujours là, et le geste à refaire est celui-là même :
      // refermer obligerait à repartir du premier appui.
      const galerie = creerGalerie({
        lister: () => of<Galerie>({ chargee: true, photos: [photo(1)] }),
        supprimer: () =>
          of<SuppressionPhotoResultat>({
            supprimee: false,
            disparue: false,
            erreurs: ["L'API est injoignable. La photo n'a pas été supprimée."],
          }),
      });

      galerie.demanderSuppression(photo(1));
      galerie.supprimer();

      expect(galerie.photos()).toHaveLength(1);
      expect(galerie.confirmation()).not.toBeNull();
      expect(galerie.erreurs()).toHaveLength(1);
    });

    it('referme la photo agrandie quand c’est elle qu’on supprime', () => {
      // La laisser ouverte montrerait une image que plus rien ne sert.
      const galerie = creerGalerie({
        lister: () => of<Galerie>({ chargee: true, photos: [photo(1)] }),
        supprimer: () => of<SuppressionPhotoResultat>({ supprimee: true }),
      });

      galerie.agrandir(photo(1));
      galerie.demanderSuppression(photo(1));
      galerie.supprimer();

      expect(galerie.agrandie()).toBeNull();
    });
  });

  describe('agrandissement', () => {
    it('ouvre et referme la photo en grand', () => {
      // La vignette ne montre pas le défaut du mur qui justifie qu'on l'ait
      // prise : c'est là que sert la version consultable.
      const galerie = creerGalerie({
        lister: () => of<Galerie>({ chargee: true, photos: [photo(1)] }),
      });

      galerie.agrandir(photo(1));
      expect(galerie.agrandie()?.id).toBe(1);

      galerie.refermer();
      expect(galerie.agrandie()).toBeNull();
    });
  });
});
