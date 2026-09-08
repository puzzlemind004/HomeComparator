import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { HttpErrorResponse, HttpRequest, HttpResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

/**
 * L'intercepteur est une fonction : il suffit de l'exécuter dans un contexte
 * d'injection, avec un « suivant » qui rend la réponse voulue.
 */
function intercepter(url: string, reponse: 'ok' | HttpErrorResponse) {
  const navigations: string[] = [];
  let sessionPerdue = false;

  const injector = Injector.create({
    providers: [
      {
        provide: AuthService,
        useValue: {
          sessionPerdue: () => {
            sessionPerdue = true;
          },
        },
      },
      {
        provide: Router,
        useValue: {
          navigateByUrl: (cible: string) => {
            navigations.push(cible);
            return Promise.resolve(true);
          },
        },
      },
    ],
  });

  const requete = new HttpRequest('GET', url);
  const suivant = () =>
    reponse === 'ok' ? of(new HttpResponse({ status: 200 })) : throwError(() => reponse);

  const flux = runInInjectionContext(injector, () => authInterceptor(requete, suivant));

  return { flux, navigations, sessionPerdue: () => sessionPerdue };
}

/** Une réponse d'API, du statut demandé. */
function erreur(status: number) {
  return new HttpErrorResponse({ status, error: {} });
}

describe('authInterceptor', () => {
  it('laisse passer une réponse normale', async () => {
    const { flux, navigations } = intercepter('/api/biens', 'ok');

    await expect(firstValueFrom(flux)).resolves.toBeInstanceOf(HttpResponse);
    expect(navigations).toEqual([]);
  });

  it('renvoie vers la connexion sur un 401', async () => {
    // Une session expire aussi bien pendant qu'un écran est déjà ouvert :
    // le garde de route, qui ne s'exécute qu'à la navigation, ne le voit pas.
    const { flux, navigations, sessionPerdue } = intercepter('/api/biens', erreur(401));

    await expect(firstValueFrom(flux)).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(navigations).toEqual(['/connexion']);
    expect(sessionPerdue()).toBe(true);
  });

  it('propage l’erreur malgré la redirection', async () => {
    // L'avaler ici laisserait l'appelant attendre une réponse qui ne
    // viendrait jamais, et ses propres messages ne s'afficheraient pas.
    const { flux } = intercepter('/api/biens', erreur(401));

    await expect(firstValueFrom(flux)).rejects.toMatchObject({ status: 401 });
  });

  it('ne redirige pas sur un 401 de la connexion elle-même', async () => {
    // Là, le 401 est un mot de passe refusé : le formulaire l'affiche, et
    // rediriger vers lui alors qu'on y est déjà n'aurait aucun sens.
    const { flux, navigations, sessionPerdue } = intercepter('/api/auth/session', erreur(401));

    await expect(firstValueFrom(flux)).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(navigations).toEqual([]);
    expect(sessionPerdue()).toBe(false);
  });

  it('ne redirige pas sur les autres erreurs', async () => {
    // Une panne de l'API n'est pas une session perdue : renvoyer vers la
    // connexion ferait ressaisir un mot de passe qui n'y changerait rien.
    const { flux, navigations } = intercepter('/api/biens', erreur(500));

    await expect(firstValueFrom(flux)).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(navigations).toEqual([]);
  });
});
