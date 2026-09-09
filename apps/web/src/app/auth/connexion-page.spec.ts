import { describe, expect, it, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { of, Subject, type Observable } from 'rxjs';
import { ConnexionPage } from './connexion-page';
import { AuthService, type ConnexionResultat } from './auth.service';

/**
 * Le composant est construit sans TestBed : seuls ses deux collaborateurs
 * sont injectés, et les assertions portent sur ses signaux plutôt que sur
 * le DOM rendu.
 */
function creerPage(connecter: (motDePasse: string) => Observable<ConnexionResultat>) {
  const navigations: string[] = [];
  const injector = Injector.create({
    providers: [
      { provide: AuthService, useValue: { connecter } },
      {
        provide: Router,
        useValue: {
          navigateByUrl: (url: string) => {
            navigations.push(url);
            return Promise.resolve(true);
          },
        },
      },
    ],
  });

  const page = runInInjectionContext(injector, () => new ConnexionPage());

  return { page, navigations };
}

const REFUS: ConnexionResultat = { connecte: false, erreur: 'Mot de passe incorrect' };

describe('ConnexionPage', () => {
  it('envoie le mot de passe saisi', () => {
    const saisies: string[] = [];
    const { page } = creerPage((motDePasse) => {
      saisies.push(motDePasse);
      return of({ connecte: true });
    });
    page.motDePasse.set('le bon');

    page.connecter();

    expect(saisies).toEqual(['le bon']);
  });

  it('ouvre le carnet une fois connecté', () => {
    const { page, navigations } = creerPage(() => of({ connecte: true }));

    page.connecter();

    expect(navigations).toEqual(['/']);
  });

  it('affiche le message de refus sans ouvrir le carnet', () => {
    const { page, navigations } = creerPage(() => of(REFUS));

    page.connecter();

    expect(page.erreur()).toBe('Mot de passe incorrect');
    expect(navigations).toEqual([]);
  });

  it('vide le champ après un refus', () => {
    // La saisie refusée n'a plus de valeur, et la laisser inviterait à
    // resoumettre la même chose.
    const { page } = creerPage(() => of(REFUS));
    page.motDePasse.set('pas le bon');

    page.connecter();

    expect(page.motDePasse()).toBe('');
  });

  it('efface le refus précédent au nouvel essai', () => {
    // Un message resté à l'écran pendant que l'essai suivant est en cours
    // se lit comme le verdict de cet essai-là.
    const reponse = new Subject<ConnexionResultat>();
    const { page } = creerPage(() => reponse);
    page.erreur.set('Mot de passe incorrect');

    page.connecter();

    expect(page.erreur()).toBeNull();
  });

  it('signale la connexion en cours puis la relâche', () => {
    const reponse = new Subject<ConnexionResultat>();
    const { page } = creerPage(() => reponse);

    page.connecter();
    expect(page.connexionEnCours()).toBe(true);

    reponse.next(REFUS);
    expect(page.connexionEnCours()).toBe(false);
  });

  it('ignore un second envoi tant que le premier n’a pas répondu', () => {
    // Le bouton est désactivé, mais la touche Entrée soumet quand même :
    // deux tentatives simultanées n'apporteraient qu'une réponse en trop.
    const reponse = new Subject<ConnexionResultat>();
    const connecter = vi.fn(() => reponse);
    const { page } = creerPage(connecter);

    page.connecter();
    page.connecter();

    expect(connecter).toHaveBeenCalledTimes(1);
  });

  it('relâche la connexion en cours après une réussite', () => {
    const { page } = creerPage(() => of({ connecte: true }));

    page.connecter();

    expect(page.connexionEnCours()).toBe(false);
  });
});
