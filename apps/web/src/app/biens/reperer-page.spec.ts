import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { RepererPage } from './reperer-page';
import { BienService, type CreationBienResultat } from './bien.service';
import type { CreationBien } from './bien';
import { unBien } from './bien.test-helper';
import { routeFicheBien } from './carnet.routes';

/**
 * L'écran est construit sans TestBed, comme ses voisins : son service et son
 * routeur sont injectés, et les assertions portent sur ses signaux plutôt
 * que sur le DOM rendu.
 */
function creerEcran(
  service: { creer?: (saisie: CreationBien) => Observable<CreationBienResultat> } = {},
  adresses: string[] = [],
) {
  const injector = Injector.create({
    providers: [
      {
        provide: BienService,
        useValue: {
          creer: () => of<CreationBienResultat>({ cree: true, bien: unBien() }),
          ...service,
        },
      },
      {
        provide: Router,
        useValue: {
          navigateByUrl: (adresse: string) => {
            adresses.push(adresse);
            return Promise.resolve(true);
          },
        },
      },
    ],
  });

  return runInInjectionContext(injector, () => new RepererPage());
}

describe('RepererPage', () => {
  it('transmet la saisie au service', () => {
    const saisies: CreationBien[] = [];
    const ecran = creerEcran({
      creer: (saisie) => {
        saisies.push(saisie);
        return of<CreationBienResultat>({ cree: true, bien: unBien() });
      },
    });

    ecran.libelle.set('le T3 avec la terrasse');
    ecran.urlAnnonce.set('https://exemple.test/annonce');
    ecran.creer();

    expect(saisies).toEqual([
      { libelle: 'le T3 avec la terrasse', urlAnnonce: 'https://exemple.test/annonce' },
    ]);
  });

  it('mène à la fiche du Bien créé', () => {
    /**
     * Et non à la liste : c'est sur la fiche que se renseigne ce qu'on sait
     * déjà de l'annonce, et l'assistant y attend. Revenir au carnet aurait
     * obligé à y retrouver le Bien qu'on vient d'y mettre — un Bien qu'on ne
     * reconnaît encore qu'à son Libellé, parmi tous les autres.
     */
    const adresses: string[] = [];
    const ecran = creerEcran({ creer: () => of({ cree: true, bien: unBien({ id: 7 }) }) }, adresses);

    ecran.libelle.set('le studio du bas');
    ecran.creer();

    expect(adresses).toEqual([routeFicheBien(7)]);
  });

  it('affiche les messages de refus sans quitter l’écran', () => {
    // Les messages viennent de l'API, qui les rédige pour être lus tels
    // quels. Quitter l'écran perdrait la saisie refusée.
    const adresses: string[] = [];
    const ecran = creerEcran(
      { creer: () => of({ cree: false, erreurs: ['Le Libellé est obligatoire.'] }) },
      adresses,
    );

    ecran.creer();

    expect(ecran.erreurs()).toEqual(['Le Libellé est obligatoire.']);
    expect(adresses).toEqual([]);
  });

  it('garde la saisie après un refus', () => {
    // Elle est ce qu'il faut corriger : la vider obligerait à tout retaper
    // pour un Libellé trop court.
    const ecran = creerEcran({ creer: () => of({ cree: false, erreurs: ['Trop court.'] }) });

    ecran.libelle.set('a');
    ecran.creer();

    expect(ecran.libelle()).toBe('a');
  });

  it('efface les messages du refus précédent à la tentative suivante', () => {
    // Un message resté à l'écran après une correction se lirait comme un
    // second refus.
    const resultats = [
      of<CreationBienResultat>({ cree: false, erreurs: ['Trop court.'] }),
      of<CreationBienResultat>({ cree: true, bien: unBien() }),
    ];
    const ecran = creerEcran({ creer: () => resultats.shift()! });

    ecran.creer();
    expect(ecran.erreurs()).toEqual(['Trop court.']);

    ecran.creer();
    expect(ecran.erreurs()).toEqual([]);
  });

  it('ignore une seconde soumission tant que la première est en cours', () => {
    // Un double appui sur « Repérer ce Bien » créerait deux Biens identiques,
    // qu'il faudrait ensuite distinguer l'un de l'autre.
    let appels = 0;
    const ecran = creerEcran({
      creer: () => {
        appels += 1;
        // Jamais résolu : la première création reste en cours, et c'est
        // l'état dans lequel le second appui doit trouver l'écran.
        return new Observable<CreationBienResultat>(() => undefined);
      },
    });

    ecran.creer();
    ecran.creer();

    expect(appels).toBe(1);
  });
});
