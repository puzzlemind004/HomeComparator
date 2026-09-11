import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, of, throwError, type Observable } from 'rxjs';
import { PhotoService } from './photo.service';
import type { PhotoApi } from './photo.api';

/**
 * Le service est construit sans TestBed, comme les autres du projet : un
 * Injector nu suffit à fournir le seul HttpClient dont il dépend.
 */
function creerService(http: {
  get?: (url: string) => Observable<unknown>;
  post?: (url: string, corps: unknown) => Observable<unknown>;
  delete?: (url: string) => Observable<unknown>;
}) {
  const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: http }] });

  return runInInjectionContext(injector, () => new PhotoService());
}

function photoApi(surcharges: Partial<PhotoApi> = {}): PhotoApi {
  return {
    id: 7,
    bienId: 1,
    fichier: 'abc.jpg',
    fichierVignette: 'abc.vignette.jpg',
    rang: 0,
    createdAt: '2026-09-11T10:00:00.000+00:00',
    updatedAt: '2026-09-11T10:00:00.000+00:00',
    ...surcharges,
  };
}

describe('PhotoService', () => {
  describe('lister', () => {
    it('traduit les photos en adresses prêtes à s’afficher', async () => {
      const service = creerService({ get: () => of([photoApi()]) });

      const galerie = await firstValueFrom(service.lister(1));

      expect(galerie.chargee).toBe(true);
      expect(galerie.chargee && galerie.photos).toEqual([
        {
          id: 7,
          url: '/api/biens/1/photos/7',
          urlVignette: '/api/biens/1/photos/7?taille=vignette',
        },
      ]);
    });

    it('distingue une API injoignable d’un Bien sans photo', async () => {
      // Dire « aucune photo » d'un Bien qui en a se lirait comme des
      // fichiers perdus, qu'on ne repassera pas prendre.
      const service = creerService({
        get: () => throwError(() => new HttpErrorResponse({ status: 0 })),
      });

      const galerie = await firstValueFrom(service.lister(1));

      expect(galerie.chargee).toBe(false);
    });
  });

  describe('ajouter', () => {
    it('envoie toutes les photos sous le même champ, en une requête', async () => {
      // Pendant une visite on prend une série : exiger un appel par photo
      // ferait répéter le geste autant de fois qu'il y a de pièces.
      let corpsEnvoye: FormData | undefined;
      const service = creerService({
        post: (_url, corps) => {
          corpsEnvoye = corps as FormData;
          return of([photoApi()]);
        },
      });

      const fichiers = [
        new File(['a'], 'salon.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'cuisine.jpg', { type: 'image/jpeg' }),
      ];

      const resultat = await firstValueFrom(service.ajouter(1, fichiers));

      expect(resultat.ajoutees).toBe(true);
      expect(corpsEnvoye).toBeInstanceOf(FormData);
      expect(corpsEnvoye!.getAll('photos')).toHaveLength(2);
    });

    it('rend les messages de refus de l’API, qui nomment le fichier', async () => {
      // Sans le nom, l'acheteur ne saurait pas laquelle de ses huit photos
      // a été refusée.
      const service = creerService({
        post: () =>
          throwError(
            () =>
              new HttpErrorResponse({
                status: 422,
                error: {
                  errors: [
                    {
                      field: 'photos',
                      rule: 'extname',
                      message: '« compromis.pdf » n’est pas une image (jpg, jpeg, png, webp)',
                    },
                  ],
                },
              }),
          ),
      });

      const resultat = await firstValueFrom(service.ajouter(1, []));

      expect(resultat.ajoutees).toBe(false);
      expect(resultat.ajoutees === false && resultat.erreurs[0]).toContain('compromis.pdf');
    });
  });

  describe('supprimer', () => {
    it('supprime la photo du Bien désigné', async () => {
      const urls: string[] = [];
      const service = creerService({
        delete: (url) => {
          urls.push(url);
          return of(undefined);
        },
      });

      const resultat = await firstValueFrom(service.supprimer(1, 7));

      expect(resultat.supprimee).toBe(true);
      expect(urls).toEqual(['/api/biens/1/photos/7']);
    });

    it('distingue la photo déjà disparue d’un échec qui l’a laissée en place', async () => {
      // Un 404 dit que la photo n'est plus là — c'était le but, et l'écran
      // peut la retirer de la galerie sans mentir.
      const service = creerService({
        delete: () => throwError(() => new HttpErrorResponse({ status: 404 })),
      });

      const resultat = await firstValueFrom(service.supprimer(1, 7));

      expect(resultat.supprimee).toBe(false);
      expect(resultat.supprimee === false && resultat.disparue).toBe(true);
      // Une photo déjà disparue n'a rien à faire lire.
      expect(resultat.supprimee === false && resultat.erreurs).toEqual([]);
    });

    it('signale l’échec qui a laissé la photo en place', async () => {
      const service = creerService({
        delete: () => throwError(() => new HttpErrorResponse({ status: 500 })),
      });

      const resultat = await firstValueFrom(service.supprimer(1, 7));

      expect(resultat.supprimee === false && resultat.disparue).toBe(false);
      expect(resultat.supprimee === false && resultat.erreurs).toHaveLength(1);
    });
  });
});
