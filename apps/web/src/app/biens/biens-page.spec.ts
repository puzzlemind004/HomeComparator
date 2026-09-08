import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { of, Subject, type Observable } from 'rxjs';
import { BiensPage } from './biens-page';
import { BienService } from './bien.service';
import type { Bien, CreationBien } from './bien';
import type { CreationBienResultat } from './bien.service';

/**
 * Le composant est construit sans TestBed : seul son service est injecté,
 * et les assertions portent sur ses signaux plutôt que sur le DOM rendu.
 */
function creerPage(service: {
  lister?: () => Observable<Bien[]>;
  creer?: (saisie: CreationBien) => Observable<CreationBienResultat>;
}) {
  const injector = Injector.create({
    providers: [{ provide: BienService, useValue: { lister: () => of([]), ...service } }],
  });

  return runInInjectionContext(injector, () => new BiensPage());
}

const bien: Bien = { id: 1, libelle: 'le T3 avec la terrasse', urlAnnonce: null };

describe('BiensPage', () => {
  it('affiche les Biens déjà enregistrés dès son ouverture', () => {
    const page = creerPage({ lister: () => of([bien]) });

    expect(page.biens()).toEqual([bien]);
  });

  it('ajoute le Bien créé en tête de liste sans recharger', () => {
    // Le Bien doit apparaître immédiatement : c'est tout l'objet de l'écran.
    const dejaLa: Bien = { id: 2, libelle: 'celui avec la cuisine refaite', urlAnnonce: null };
    const page = creerPage({
      lister: () => of([dejaLa]),
      creer: () => of({ cree: true, bien }),
    });

    page.libelle.set('le T3 avec la terrasse');
    page.creer();

    expect(page.biens()).toEqual([bien, dejaLa]);
  });

  it('vide le formulaire après une création réussie', () => {
    const page = creerPage({ creer: () => of({ cree: true, bien }) });

    page.libelle.set('le T3 avec la terrasse');
    page.urlAnnonce.set('https://exemple.test/annonce/1');
    page.creer();

    expect(page.libelle()).toBe('');
    expect(page.urlAnnonce()).toBe('');
  });

  it('transmet la saisie au service', () => {
    const saisies: CreationBien[] = [];
    const page = creerPage({
      creer: (saisie) => {
        saisies.push(saisie);
        return of({ cree: true, bien });
      },
    });

    page.libelle.set('le T3 avec la terrasse');
    page.urlAnnonce.set('https://exemple.test/annonce/1');
    page.creer();

    expect(saisies).toEqual([
      { libelle: 'le T3 avec la terrasse', urlAnnonce: 'https://exemple.test/annonce/1' },
    ]);
  });

  it('affiche les messages de refus sans toucher à la liste ni au formulaire', () => {
    const page = creerPage({
      creer: () => of({ cree: false, erreurs: ['Le Libellé est obligatoire'] }),
    });

    page.libelle.set('  ');
    page.creer();

    expect(page.erreurs()).toEqual(['Le Libellé est obligatoire']);
    expect(page.biens()).toEqual([]);
    // La saisie est conservée : l'acheteur doit pouvoir la corriger.
    expect(page.libelle()).toBe('  ');
  });

  it('efface les messages du refus précédent à la tentative suivante', () => {
    const resultats = new Subject<CreationBienResultat>();
    const page = creerPage({ creer: () => resultats });

    page.creer();
    resultats.next({ cree: false, erreurs: ['Le Libellé est obligatoire'] });
    expect(page.erreurs()).toEqual(['Le Libellé est obligatoire']);

    page.creer();
    expect(page.erreurs()).toEqual([]);
  });

  it('ignore une seconde soumission tant que la première est en cours', () => {
    // Sans ce garde-fou, un double clic créerait deux fois le même Bien.
    let appels = 0;
    const page = creerPage({
      creer: () => {
        appels += 1;
        return new Subject<CreationBienResultat>();
      },
    });

    page.creer();
    page.creer();

    expect(appels).toBe(1);
    expect(page.enregistrement()).toBe(true);
  });
});
