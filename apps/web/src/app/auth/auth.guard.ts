import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';

/** La route de l'écran de connexion, nommée ici plutôt que recopiée. */
export const ROUTE_CONNEXION = '/connexion';

/**
 * Renvoie vers la connexion tout accès dont la session ne vaut pas (#4).
 *
 * Ce garde ne protège rien : l'API refuse d'elle-même tout appel non
 * authentifié, et c'est là que tient la sécurité. Il évite seulement
 * d'afficher un écran que l'API remplirait de 401.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // L'API est interrogée à chaque navigation gardée plutôt qu'une fois pour
  // toutes : une session peut expirer entre deux écrans, et le cookie étant
  // `httpOnly`, rien d'autre ici ne peut le savoir.
  return auth
    .verifier()
    .pipe(map((authentifie) => authentifie || router.parseUrl(ROUTE_CONNEXION)));
};

/**
 * Renvoie vers le carnet un accès à la connexion alors que la session vaut
 * déjà : redemander le mot de passe à qui l'a donné n'apprend rien.
 */
export const dejaConnecteGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.verifier().pipe(map((authentifie) => !authentifie || router.parseUrl('/')));
};
