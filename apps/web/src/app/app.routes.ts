import { Routes } from '@angular/router';
import { authGuard, dejaConnecteGuard } from './auth/auth.guard';
import { ConnexionPage } from './auth/connexion-page';
import { BiensPage } from './biens/biens-page';
import { FicheBienPage } from './biens/fiche-bien-page';

/**
 * Le carnet exige la session, la connexion l'exclut (#4).
 *
 * Le garde ne protège pas les données — l'API refuse d'elle-même tout appel
 * non authentifié —, il évite d'ouvrir un écran que l'API remplirait de 401.
 */
export const routes: Routes = [
  {
    path: 'connexion',
    component: ConnexionPage,
    canActivate: [dejaConnecteGuard],
    title: 'Connexion — HomeComparator',
  },
  {
    path: '',
    component: BiensPage,
    canActivate: [authGuard],
    title: 'Mes Biens — HomeComparator',
  },
  {
    path: 'biens/:id',
    component: FicheBienPage,
    canActivate: [authGuard],
    // Le Libellé titrerait mieux l'onglet, mais il n'est connu qu'une fois
    // la fiche chargée : le titre se fixe avant.
    title: 'Fiche du Bien — HomeComparator',
  },
  // Toute autre adresse ramène au carnet, donc à la connexion si la session
  // ne vaut pas : une page d'erreur n'apprendrait rien à l'unique acheteur.
  { path: '**', redirectTo: '' },
];
