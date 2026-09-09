import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // L'intercepteur ramène à la connexion dès qu'un appel revient en 401 :
    // une session peut expirer pendant qu'un écran est déjà ouvert (#4).
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
