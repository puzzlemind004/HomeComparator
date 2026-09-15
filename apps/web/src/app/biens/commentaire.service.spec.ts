import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, of, throwError, type Observable } from 'rxjs';
import { CommentaireService } from './commentaire.service';
import type { CommentaireApi } from './commentaire.api';

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

  return runInInjectionContext(injector, () => new CommentaireService());
}

function commentaireApi(surcharges: Partial<CommentaireApi> = {}): CommentaireApi {
  return {
    id: 3,
    bienId: 1,
    texte: 'La salle de bain est à refaire',
    photoId: null,
    photo: null,
    note: 2,
    createdAt: '2026-09-11T10:30:00.000+00:00',
    updatedAt: '2026-09-11T10:30:00.000+00:00',
    ...surcharges,
  };
}

const unFichier = () => new File(['a'], 'sdb.jpg', { type: 'image/jpeg' });

describe('CommentaireService', () => {
  describe('lister', () => {
    it('traduit les Commentaires pour l’écran', async () => {
      const service = creerService({ get: () => of([commentaireApi()]) });

      const resultat = await firstValueFrom(service.lister(1));

      expect(resultat.chargee).toBe(true);
      expect(resultat.chargee && resultat.commentaires[0].texte).toBe(
        'La salle de bain est à refaire',
      );
    });

    it('distingue une API injoignable d’un Bien sans Commentaire', async () => {
      // Dire « aucun commentaire » d'un Bien qui en a se lirait comme des
      // observations perdues, qu'on ne réécrira pas.
      const service = creerService({
        get: () => throwError(() => new HttpErrorResponse({ status: 0 })),
      });

      const resultat = await firstValueFrom(service.lister(1));

      expect(resultat.chargee).toBe(false);
    });
  });

  describe('ajouter', () => {
    it('envoie la photo, le texte et l’appréciation en une seule requête', async () => {
      // C'est tout l'intérêt du geste : un aller-retour et non deux, celui
      // qui échoue au second laissant une photo que personne n'a demandée.
      let corps: FormData | undefined;
      let adresse = '';

      const service = creerService({
        post: (url, envoye) => {
          adresse = url;
          corps = envoye as FormData;
          return of(commentaireApi());
        },
      });

      const photo = unFichier();
      await firstValueFrom(service.ajouter(1, { texte: 'à refaire', photo, note: 2 }));

      expect(adresse).toBe('/api/biens/1/commentaires');
      expect(corps?.get('texte')).toBe('à refaire');
      expect(corps?.get('note')).toBe('2');
      expect(corps?.get('photo')).toBe(photo);
    });

    it('n’envoie pas les champs laissés vides', async () => {
      // Un texte absent se dit mieux par son absence que par une chaîne
      // vide, que l'API aurait à démêler.
      let corps: FormData | undefined;

      const service = creerService({
        post: (_url, envoye) => {
          corps = envoye as FormData;
          return of(commentaireApi());
        },
      });

      await firstValueFrom(service.ajouter(1, { texte: '   ', photo: null, note: null }));

      expect(corps?.has('texte')).toBe(false);
      expect(corps?.has('note')).toBe(false);
      expect(corps?.has('photo')).toBe(false);
    });

    it('rapporte le refus de l’API tel qu’il est rédigé', async () => {
      // L'API nomme le fichier en cause : l'acheteur ne saurait pas sinon
      // laquelle de ses photos a été refusée.
      const service = creerService({
        post: () =>
          throwError(
            () =>
              new HttpErrorResponse({
                status: 422,
                error: { errors: [{ message: '« sdb.jpg » dépasse 10 Mo' }] },
              }),
          ),
      });

      const resultat = await firstValueFrom(
        service.ajouter(1, { texte: '', photo: unFichier(), note: null }),
      );

      expect(resultat.ajoute).toBe(false);
      expect(!resultat.ajoute && resultat.erreurs).toEqual(['« sdb.jpg » dépasse 10 Mo']);
    });

    it('dit que rien n’a été ajouté quand l’API ne répond pas', async () => {
      const service = creerService({
        post: () => throwError(() => new HttpErrorResponse({ status: 0 })),
      });

      const resultat = await firstValueFrom(
        service.ajouter(1, { texte: 'à refaire', photo: null, note: null }),
      );

      expect(!resultat.ajoute && resultat.erreurs[0]).toContain("n'a pas été ajouté");
    });
  });

  describe('supprimer', () => {
    it('supprime le Commentaire par son adresse', async () => {
      let adresse = '';
      const service = creerService({
        delete: (url) => {
          adresse = url;
          return of(undefined);
        },
      });

      const resultat = await firstValueFrom(service.supprimer(1, 3));

      expect(adresse).toBe('/api/biens/1/commentaires/3');
      expect(resultat.supprime).toBe(true);
    });

    it('traite un Commentaire déjà parti comme l’état visé', async () => {
      // L'écran peut le retirer sans inventer un succès.
      const service = creerService({
        delete: () => throwError(() => new HttpErrorResponse({ status: 404 })),
      });

      const resultat = await firstValueFrom(service.supprimer(1, 3));

      expect(resultat.supprime).toBe(false);
      expect(!resultat.supprime && resultat.disparu).toBe(true);
      expect(!resultat.supprime && resultat.erreurs).toEqual([]);
    });

    it('rapporte une API injoignable comme un échec', async () => {
      const service = creerService({
        delete: () => throwError(() => new HttpErrorResponse({ status: 0 })),
      });

      const resultat = await firstValueFrom(service.supprimer(1, 3));

      expect(!resultat.supprime && resultat.disparu).toBe(false);
      expect(!resultat.supprime && resultat.erreurs[0]).toContain("n'a pas été supprimé");
    });
  });
});
