import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { HttpClient, HttpErrorResponse, type HttpParams } from '@angular/common/http';
import { firstValueFrom, of, throwError, type Observable } from 'rxjs';
import { BienService } from './bien.service';
import type { BienApi } from './bien.api';
import { unBien } from './bien.test-helper';

/**
 * Le service est construit sans TestBed : un Injector nu suffit à fournir
 * le seul HttpClient dont il dépend.
 *
 * `HttpClient` est très surchargé ; le double ne déclare que les signatures
 * réellement employées par le service.
 */
function creerService(http: {
  get?: (url: string, options?: { params?: HttpParams }) => Observable<unknown>;
  post?: (url: string, corps: unknown) => Observable<unknown>;
  patch?: (url: string, corps: unknown) => Observable<unknown>;
  delete?: (url: string) => Observable<unknown>;
}) {
  const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: http }] });

  return runInInjectionContext(injector, () => new BienService());
}

function bienApi(surcharges: Partial<BienApi> = {}): BienApi {
  return {
    id: 1,
    libelle: 'le T3 avec la terrasse',
    urlAnnonce: null,
    notes: null,
    statut: 'aContacter',
    dateVisite: null,
    montantDerniereOffre: null,
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
          unBien(),
          unBien({ id: 2, libelle: 'celui avec la cuisine refaite' }),
        ],
      });
    });

    it('n’envoie aucun paramètre quand la liste n’est pas filtrée', () => {
      // Ouvrir le carnet montre tous les Biens, sorties comprises (#7).
      let recus: HttpParams | undefined;
      const service = creerService({
        get: (_url, options) => {
          recus = options?.params;
          return of([]);
        },
      });

      service.lister().subscribe();

      expect(recus).toBeUndefined();
    });

    it('demande à l’API les Biens d’un seul Statut', () => {
      /**
       * Le filtre part à l'API plutôt que de s'appliquer sur une liste déjà
       * reçue : c'est ce que la colonne permet (ADR-0004), et la liste n'a
       * pas à voyager en entier pour qu'on en regarde le quart.
       */
      let recus: HttpParams | undefined;
      const service = creerService({
        get: (_url, options) => {
          recus = options?.params;
          return of([]);
        },
      });

      service.lister('ecarte').subscribe();

      expect(recus?.get('statut')).toBe('ecarte');
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
        bien: unBien(),
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
  describe('consulter', () => {
    it('interroge la fiche du Bien et la traduit pour l’affichage', async () => {
      const urls: string[] = [];
      const service = creerService({
        get: (url) => {
          urls.push(url);
          return of(bienApi({ prixDemande: 250000 }));
        },
      });

      const fiche = await firstValueFrom(service.consulter(1));

      expect(urls).toEqual(['/api/biens/1']);
      expect(fiche).toEqual({ etat: 'chargee', bien: unBien({ criteres: { prixDemande: 250000 } }) });
    });

    it('distingue un Bien introuvable d’une API injoignable', async () => {
      // L'un est un fait — une adresse qui ne désigne plus rien —, l'autre
      // un incident qui se répare en réessayant : l'écran n'a pas la même
      // chose à dire dans les deux cas.
      const introuvable = creerService({
        get: () => throwError(() => new HttpErrorResponse({ status: 404 })),
      });
      const injoignable = creerService({
        get: () => throwError(() => new HttpErrorResponse({ status: 0 })),
      });

      expect(await firstValueFrom(introuvable.consulter(1))).toEqual({ etat: 'introuvable' });
      expect(await firstValueFrom(injoignable.consulter(1))).toEqual({ etat: 'injoignable' });
    });
  });

  describe('modifier', () => {
    it('n’envoie que les Critères modifiés', async () => {
      // C'est ce qui fait la mise à jour partielle : sans cela, chaque
      // modification effacerait les quatorze autres Critères.
      const envois: { url: string; corps: unknown }[] = [];
      const service = creerService({
        patch: (url, corps) => {
          envois.push({ url, corps });
          return of(bienApi({ prixDemande: 245000 }));
        },
      });

      await firstValueFrom(service.modifier(1, { prixDemande: 245000 }));

      expect(envois).toEqual([{ url: '/api/biens/1', corps: { prixDemande: 245000 } }]);
    });

    it('rend le Bien tel qu’il est après enregistrement', async () => {
      const service = creerService({ patch: () => of(bienApi({ prixDemande: 245000 })) });

      const resultat = await firstValueFrom(service.modifier(1, { prixDemande: 245000 }));

      expect(resultat).toEqual({
        enregistre: true,
        bien: unBien({ criteres: { prixDemande: 245000 } }),
      });
    });

    it('rapporte les messages de validation de l’API plutôt que de les propager', async () => {
      const service = creerService({
        patch: () => throwError(() => erreurValidation('libelle', 'Le Libellé est obligatoire')),
      });

      const resultat = await firstValueFrom(service.modifier(1, { libelle: '' }));

      expect(resultat).toEqual({
        enregistre: false,
        erreurs: ['Le Libellé est obligatoire'],
      });
    });

    it('dit que rien n’a été enregistré quand l’API est injoignable', async () => {
      // Le message doit parler de la modification, et non du Bien : celui-ci
      // existe déjà, et laisser croire qu'il a disparu serait pire.
      const service = creerService({
        patch: () => throwError(() => new HttpErrorResponse({ status: 0 })),
      });

      const resultat = await firstValueFrom(service.modifier(1, { prixDemande: 1 }));

      expect(resultat).toEqual({
        enregistre: false,
        erreurs: ["L'API est injoignable. La modification n'a pas été enregistrée."],
      });
    });
  });

  describe('supprimer', () => {
    it('demande à l’API la suppression du Bien', async () => {
      const urls: string[] = [];
      const service = creerService({
        delete: (url) => {
          urls.push(url);
          return of(null);
        },
      });

      const resultat = await firstValueFrom(service.supprimer(1));

      expect(urls).toEqual(['/api/biens/1']);
      expect(resultat).toEqual({ supprime: true });
    });

    it('distingue un Bien déjà disparu d’une API injoignable', async () => {
      // Les deux sont des échecs, mais l'écran n'a pas la même chose à en
      // faire : le premier est un fait acquis — le Bien n'est plus là, ce
      // qui était le but —, le second se répare en réessayant.
      const service = creerService({
        delete: () => throwError(() => new HttpErrorResponse({ status: 404 })),
      });

      const resultat = await firstValueFrom(service.supprimer(1));

      expect(resultat).toEqual({ supprime: false, disparu: true, erreurs: [] });
    });

    it('dit que rien n’a été supprimé quand l’API est injoignable', async () => {
      // Le message doit dire que le Bien est toujours là : croire à une
      // suppression qui n'a pas eu lieu ferait chercher un Bien qu'on
      // retrouverait au rechargement suivant.
      const service = creerService({
        delete: () => throwError(() => new HttpErrorResponse({ status: 0 })),
      });

      const resultat = await firstValueFrom(service.supprimer(1));

      expect(resultat).toEqual({
        supprime: false,
        disparu: false,
        erreurs: ["L'API est injoignable. Le Bien n'a pas été supprimé."],
      });
    });
  });
});
