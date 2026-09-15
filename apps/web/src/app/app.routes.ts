import { Routes } from '@angular/router';
import { authGuard, dejaConnecteGuard } from './auth/auth.guard';
import { ConnexionPage } from './auth/connexion-page';
import { BiensPage } from './biens/biens-page';
import { ComparaisonPage } from './biens/comparaison-page';
import { ExportPage } from './biens/export-page';
import { FicheBienPage } from './biens/fiche-bien-page';
import { ROUTE_COMPARAISON, ROUTE_EXPORT } from './biens/carnet.routes';

/**
 * Le carnet exige la session, la connexion l'exclut (#4).
 *
 * Le garde ne protège pas les données — l'API refuse d'elle-même tout appel
 * non authentifié —, il évite d'ouvrir un écran que l'API remplirait de 401.
 *
 * Les chemins viennent de `carnet.routes` et s'y écrivent une seule fois : la
 * navigation les cite aussi, et deux orthographes qui divergeraient
 * donneraient une entrée de menu qui ne s'allume jamais (#124). Ils y sont
 * écrits absolus, comme les liens les portent, et se posent ici sans leur
 * barre de tête.
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
    // Le face-à-face est un écran et non plus une section du carnet (#124) :
    // c'est l'objet du produit, et il s'atteint sans avoir rien coché.
    path: ROUTE_COMPARAISON.slice(1),
    component: ComparaisonPage,
    canActivate: [authGuard],
    title: 'Comparer — HomeComparator',
  },
  {
    // L'export a sa route pour être atteignable depuis n'importe quel écran
    // (#14, #124).
    path: ROUTE_EXPORT.slice(1),
    component: ExportPage,
    canActivate: [authGuard],
    title: 'Exporter — HomeComparator',
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
