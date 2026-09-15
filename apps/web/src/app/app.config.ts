import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // Deux réglages que le routeur n'a pas par défaut, et dont la
      // navigation du carnet a besoin (#124) :
      //
      // `anchorScrolling` fait descendre au formulaire de repérage quand on
      // suit « + Repérer un Bien » depuis un autre écran. Sans lui, le lien
      // change d'écran et reste en haut, ce qui donne à l'action l'air de
      // n'avoir rien fait sur un carnet un peu long.
      //
      // `scrollPositionRestoration` remet la page en haut à chaque changement
      // d'écran. Le routeur ne le fait pas de lui-même : passer d'un carnet
      // défilé à la comparaison ouvrirait celle-ci à mi-hauteur, sur un
      // tableau dont on ne verrait pas les en-têtes.
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
    ),
    // L'intercepteur ramène à la connexion dès qu'un appel revient en 401 :
    // une session peut expirer pendant qu'un écran est déjà ouvert (#4).
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
