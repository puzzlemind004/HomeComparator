import { Routes } from '@angular/router';
import { authGuard, dejaConnecteGuard } from './auth/auth.guard';
import { ConnexionPage } from './auth/connexion-page';
import { BiensPage } from './biens/biens-page';
import { ComparaisonPage } from './biens/comparaison-page';
import { ExportPage } from './biens/export-page';
import { FicheBienPage } from './biens/fiche-bien-page';
import { CommenterPage } from './biens/commenter-page';
import { RepererPage } from './biens/reperer-page';
import { ROUTE_COMPARAISON, ROUTE_EXPORT, ROUTE_REPERER } from './biens/carnet.routes';

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
    /**
     * Le repérage est un écran et non plus un formulaire en tête de liste :
     * la maquette sépare la création de la consultation, et la liste est ce
     * qu'on vient voir en ouvrant le carnet.
     */
    path: ROUTE_REPERER.slice(1),
    component: RepererPage,
    canActivate: [authGuard],
    title: 'Repérer un Bien — HomeComparator',
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
  {
    /**
     * L'écran où s'écrit un Commentaire, sous la fiche du Bien qu'il
     * concerne : c'est ce Bien-là qu'on commente, et l'adresse le dit.
     *
     * Un écran et non un formulaire déplié dans la fiche : le geste se fait
     * debout pendant une visite, l'appareil photo occupe l'écran entier, et
     * revenir de la prise de vue au milieu d'une fiche longue ferait perdre
     * l'endroit où l'on en était.
     */
    path: 'biens/:id/commenter',
    component: CommenterPage,
    canActivate: [authGuard],
    title: 'Commenter — HomeComparator',
  },
  // Toute autre adresse ramène au carnet, donc à la connexion si la session
  // ne vaut pas : une page d'erreur n'apprendrait rien à l'unique acheteur.
  { path: '**', redirectTo: '' },
];
