import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, of, throwError, type Observable } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Le service est construit sans TestBed : un Injector nu suffit à fournir
 * le seul HttpClient dont il dépend.
 */
function creerService(http: {
  get?: (url: string) => Observable<unknown>;
  post?: (url: string, corps: unknown) => Observable<unknown>;
  delete?: (url: string) => Observable<unknown>;
}) {
  const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: http }] });

  return runInInjectionContext(injector, () => new AuthService());
}

/** Un refus de connexion, tel que l'API le produit. */
function refus(message = 'Mot de passe incorrect') {
  return new HttpErrorResponse({ status: 401, error: { message } });
}

describe('AuthService', () => {
  it('ne sait rien de la session avant d’avoir interrogé l’API', () => {
    // Le cookie est `httpOnly` : rien ici ne peut le lire, et supposer une
    // réponse avant de l'avoir reviendrait à décider de l'accès côté client.
    const service = creerService({});

    expect(service.authentifie()).toBeNull();
  });

  describe('verifier', () => {
    it('interroge l’API et retient la session ouverte', async () => {
      const urls: string[] = [];
      const service = creerService({
        get: (url) => {
          urls.push(url);
          return of({ authentifie: true });
        },
      });

      await expect(firstValueFrom(service.verifier())).resolves.toBe(true);
      expect(urls).toEqual(['/api/auth/session']);
      expect(service.authentifie()).toBe(true);
    });

    it('retient une session absente', async () => {
      const service = creerService({ get: () => of({ authentifie: false }) });

      await expect(firstValueFrom(service.verifier())).resolves.toBe(false);
      expect(service.authentifie()).toBe(false);
    });

    it('traite une API injoignable comme une session absente', async () => {
      // L'écran de connexion est ce qu'on peut montrer de plus utile : il
      // dira lui-même que l'API ne répond pas si l'acheteur tente d'entrer.
      const service = creerService({ get: () => throwError(() => new Error('injoignable')) });

      await expect(firstValueFrom(service.verifier())).resolves.toBe(false);
      expect(service.authentifie()).toBe(false);
    });
  });

  describe('connecter', () => {
    it('envoie le mot de passe et retient la session ouverte', async () => {
      const appels: { url: string; corps: unknown }[] = [];
      const service = creerService({
        post: (url, corps) => {
          appels.push({ url, corps });
          return of({ authentifie: true });
        },
      });

      const resultat = await firstValueFrom(service.connecter('le bon'));

      expect(resultat).toEqual({ connecte: true });
      expect(appels).toEqual([{ url: '/api/auth/session', corps: { motDePasse: 'le bon' } }]);
      expect(service.authentifie()).toBe(true);
    });

    it('rapporte le message de refus de l’API sans le réécrire', async () => {
      // L'API rédige ce message pour être lu tel quel, et le rend identique
      // quelle que soit la cause du refus : le traduire ici le trahirait.
      const service = creerService({ post: () => throwError(() => refus()) });

      const resultat = await firstValueFrom(service.connecter('pas le bon'));

      expect(resultat).toEqual({ connecte: false, erreur: 'Mot de passe incorrect' });
    });

    it('n’ouvre pas la session sur un refus', async () => {
      const service = creerService({ post: () => throwError(() => refus()) });

      await firstValueFrom(service.connecter('pas le bon'));

      expect(service.authentifie()).toBeNull();
    });

    it('distingue une API injoignable d’un mot de passe refusé', async () => {
      // Annoncer « mot de passe incorrect » alors que l'API est éteinte
      // enverrait l'acheteur chercher une erreur de saisie qui n'existe pas.
      const service = creerService({ post: () => throwError(() => new Error('injoignable')) });

      const resultat = await firstValueFrom(service.connecter('le bon'));

      expect(resultat).toEqual({
        connecte: false,
        erreur: "L'API est injoignable. La connexion n'a pas pu aboutir.",
      });
    });

    it('ne prête pas un message de refus à une panne renvoyée en 500', async () => {
      const service = creerService({
        post: () => throwError(() => new HttpErrorResponse({ status: 500, error: {} })),
      });

      const resultat = await firstValueFrom(service.connecter('le bon'));

      expect(resultat).toEqual({
        connecte: false,
        erreur: "L'API est injoignable. La connexion n'a pas pu aboutir.",
      });
    });
  });

  describe('deconnecter', () => {
    it('demande la fermeture à l’API et oublie la session', async () => {
      const urls: string[] = [];
      const service = creerService({
        get: () => of({ authentifie: true }),
        delete: (url) => {
          urls.push(url);
          return of({ authentifie: false });
        },
      });
      await firstValueFrom(service.verifier());

      await firstValueFrom(service.deconnecter());

      expect(urls).toEqual(['/api/auth/session']);
      expect(service.authentifie()).toBe(false);
    });

    it('oublie la session même si l’appel échoue', async () => {
      // Rester sur « connecté » ferait croire à une session ouverte que
      // l'acheteur a justement voulu fermer.
      const service = creerService({
        get: () => of({ authentifie: true }),
        delete: () => throwError(() => new Error('injoignable')),
      });
      await firstValueFrom(service.verifier());

      await firstValueFrom(service.deconnecter());

      expect(service.authentifie()).toBe(false);
    });
  });

  describe('sessionPerdue', () => {
    it('oublie la session sans rien demander à l’API', async () => {
      // C'est ce que l'intercepteur appelle sur un 401 : l'API vient de
      // répondre, la réinterroger ne ferait qu'un aller-retour de plus.
      const service = creerService({ get: () => of({ authentifie: true }) });
      await firstValueFrom(service.verifier());

      service.sessionPerdue();

      expect(service.authentifie()).toBe(false);
    });
  });
});
