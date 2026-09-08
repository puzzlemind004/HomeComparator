import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { Router, type UrlTree } from '@angular/router';
import { firstValueFrom, of, type Observable } from 'rxjs';
import { authGuard, dejaConnecteGuard } from './auth.guard';
import { AuthService } from './auth.service';

/**
 * Les gardes sont des fonctions : il suffit de les exécuter dans un
 * contexte d'injection portant leurs deux dépendances.
 *
 * `parseUrl` est doublé par un objet marqué de l'URL demandée : un vrai
 * `UrlTree` n'apporterait rien à l'assertion et exigerait tout le routeur.
 */
function executer(garde: typeof authGuard, authentifie: boolean) {
  const injector = Injector.create({
    providers: [
      { provide: AuthService, useValue: { verifier: () => of(authentifie) } },
      { provide: Router, useValue: { parseUrl: (url: string) => ({ url }) as unknown as UrlTree } },
    ],
  });

  // Les gardes n'utilisent ni la route ni l'état : les paramètres exigés par
  // la signature sont fournis vides plutôt que fabriqués.
  const resultat = runInInjectionContext(injector, () =>
    garde(null as never, null as never),
  ) as Observable<true | UrlTree>;

  return firstValueFrom(resultat);
}

describe('authGuard', () => {
  it('laisse ouvrir le carnet quand la session vaut', async () => {
    await expect(executer(authGuard, true)).resolves.toBe(true);
  });

  it('renvoie vers la connexion quand la session ne vaut pas', async () => {
    // C'est le critère « un accès non authentifié au front redirige vers la
    // connexion » : sans cela, l'écran s'ouvre et se remplit de 401.
    await expect(executer(authGuard, false)).resolves.toEqual({ url: '/connexion' });
  });
});

describe('dejaConnecteGuard', () => {
  it('renvoie vers le carnet quand la session vaut déjà', async () => {
    // Redemander le mot de passe à qui vient de le donner n'apprend rien.
    await expect(executer(dejaConnecteGuard, true)).resolves.toEqual({ url: '/' });
  });

  it('laisse ouvrir la connexion quand la session ne vaut pas', async () => {
    await expect(executer(dejaConnecteGuard, false)).resolves.toBe(true);
  });
});
