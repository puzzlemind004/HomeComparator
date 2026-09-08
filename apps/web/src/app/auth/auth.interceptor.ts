import { inject } from '@angular/core';
import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { ROUTE_CONNEXION } from './auth.guard';

/** Les appels d'authentification eux-mêmes, que l'intercepteur laisse passer. */
const SESSION_URL = '/api/auth/session';

/**
 * Renvoie vers la connexion dès qu'un appel revient en 401 (#4).
 *
 * Le garde de route ne suffit pas : une session expire aussi bien pendant
 * qu'on est sur un écran, et l'acheteur verrait alors ses saisies échouer
 * sans comprendre pourquoi.
 *
 * L'erreur est propagée malgré la redirection : l'appelant a ses propres
 * messages à afficher, et l'avaler ici lui ferait attendre indéfiniment une
 * réponse qui ne viendra pas.
 */
export const authInterceptor: HttpInterceptorFn = (requete, suivant) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return suivant(requete).pipe(
    catchError((erreur: unknown) => {
      // Un 401 sur la connexion elle-même, c'est un mot de passe refusé :
      // le formulaire l'affiche, et rediriger vers lui n'aurait aucun sens.
      const estAppelDeSession = requete.url === SESSION_URL;

      if (erreur instanceof HttpErrorResponse && erreur.status === 401 && !estAppelDeSession) {
        auth.sessionPerdue();
        void router.navigateByUrl(ROUTE_CONNEXION);
      }

      return throwError(() => erreur);
    }),
  );
};
