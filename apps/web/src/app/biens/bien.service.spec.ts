import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, of, throwError, type Observable } from 'rxjs';
import { BienService } from './bien.service';
import type { BienApi } from './bien.api';

/**
 * Le service est construit sans TestBed : un Injector nu suffit à fournir
 * le seul HttpClient dont il dépend.
 *
 * `HttpClient` est très surchargé ; le double ne déclare que les signatures
 * réellement employées par le service.
 */
function creerService(http: {
  get?: (url: string) => Observable<unknown>;
  post?: (url: string, corps: unknown) => Observable<unknown>;
}) {
  const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: http }] });

  return runInInjectionContext(injector, () => new BienService());
}

function bienApi(surcharges: Partial<BienApi> = {}): BienApi {
  return {
    id: 1,
    libelle: 'le T3 avec la terrasse',
    urlAnnonce: null,
    createdAt: '2026-09-08T19:00:00.000+00:00',
    updatedAt: '2026-09-08T19:00:00.000+00:00',
    ...surcharges,
  };
}

/** Une réponse 422 de l'API, telle que le validateur la produit. */
function erreurValidation(field: string, message: string) {
  return new HttpErrorResponse({
    status: 422,
    error: { errors: [{ field, message, rule: 'required' }] },
  });
}

describe('BienService', () => {
  describe('lister', () => {
    it('interroge la liste des Biens et la traduit pour l’affichage', async () => {
      const urls: string[] = [];
      const service = creerService({
        get: (url) => {
          urls.push(url);
          return of([bienApi(), bienApi({ id: 2, libelle: 'celui avec la cuisine refaite' })]);
        },
      });

      const liste = await firstValueFrom(service.lister());

      expect(urls).toEqual(['/api/biens']);
      expect(liste).toEqual({
        chargee: true,
        biens: [
          { id: 1, libelle: 'le T3 avec la terrasse', urlAnnonce: null },
          { id: 2, libelle: 'celui avec la cuisine refaite', urlAnnonce: null },
        ],
      });
    });

    it('rend une liste vide quand aucun Bien n’est enregistré', async () => {
      const service = creerService({ get: () => of([]) });

      expect(await firstValueFrom(service.lister())).toEqual({ chargee: true, biens: [] });
    });

    it('distingue une API injoignable d’un carnet vide', async () => {
      // Rabattre l'échec sur une liste vide ferait dire à l'écran que le
      // carnet est vide : sur des Biens saisis à la main, cela se lit comme
      // une perte de données.
      const service = creerService({
        get: () => throwError(() => new HttpErrorResponse({ status: 0 })),
      });

      expect(await firstValueFrom(service.lister())).toEqual({ chargee: false });
    });
  });

  describe('creer', () => {
    it('envoie la saisie à l’API et rend le Bien créé', async () => {
      const envois: { url: string; corps: unknown }[] = [];
      const service = creerService({
        post: (url, corps) => {
          envois.push({ url, corps });
          return of(bienApi());
        },
      });

      const resultat = await firstValueFrom(
        service.creer({ libelle: 'le T3 avec la terrasse', urlAnnonce: '' }),
      );

      expect(envois).toEqual([
        { url: '/api/biens', corps: { libelle: 'le T3 avec la terrasse' } },
      ]);
      expect(resultat).toEqual({
        cree: true,
        bien: { id: 1, libelle: 'le T3 avec la terrasse', urlAnnonce: null },
      });
    });

    it('rapporte les messages de validation de l’API plutôt que de les propager', async () => {
      // Un refus de validation est un état à afficher dans le formulaire,
      // pas une exception à laisser fuir.
      const service = creerService({
        post: () => throwError(() => erreurValidation('libelle', 'Le Libellé est obligatoire')),
      });

      const resultat = await firstValueFrom(
        service.creer({ libelle: '', urlAnnonce: '' }),
      );

      expect(resultat).toEqual({ cree: false, erreurs: ['Le Libellé est obligatoire'] });
    });

    it('rapporte une erreur compréhensible quand l’API est injoignable', async () => {
      const service = creerService({
        post: () => throwError(() => new HttpErrorResponse({ status: 0 })),
      });

      const resultat = await firstValueFrom(
        service.creer({ libelle: 'le T3', urlAnnonce: '' }),
      );

      expect(resultat).toEqual({
        cree: false,
        erreurs: ["L'API est injoignable. Le Bien n'a pas été enregistré."],
      });
    });
  });
});
