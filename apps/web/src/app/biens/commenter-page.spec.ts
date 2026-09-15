import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { CommenterPage } from './commenter-page';
import { CommentaireService, type AjoutCommentaireResultat } from './commentaire.service';
import { BienService, type FicheBien } from './bien.service';
import type { AjoutCommentaire } from './commentaire';
import { unBien } from './bien.test-helper';
import { routeFicheBien } from './carnet.routes';

/**
 * `URL.createObjectURL` n'existe pas dans l'environnement de test, qui n'a
 * pas de couche d'objets blob. L'aperçu est pourtant ce qui dit à l'acheteur
 * que sa photo est passée : il est doublé plutôt que contourné, pour que les
 * tests décrivent l'écran tel qu'il est écrit.
 */
const urlsRevoquees: string[] = [];

beforeEach(() => {
  urlsRevoquees.length = 0;
  URL.createObjectURL = (() => 'blob:apercu') as typeof URL.createObjectURL;
  URL.revokeObjectURL = ((url: string) => {
    urlsRevoquees.push(url);
  }) as typeof URL.revokeObjectURL;
});

afterEach(() => {
  urlsRevoquees.length = 0;
});

/**
 * L'écran est construit sans TestBed, comme la fiche : ses services et sa
 * route sont injectés, et les assertions portent sur ses signaux.
 */
function creerEcran(
  service: {
    ajouter?: (id: number, ajout: AjoutCommentaire) => Observable<AjoutCommentaireResultat>;
  } = {},
  id = '1',
  navigations: unknown[][] = [],
) {
  const injector = Injector.create({
    providers: [
      {
        provide: CommentaireService,
        useValue: {
          ajouter: () =>
            of<AjoutCommentaireResultat>({
              ajoute: true,
              commentaire: { id: 3, texte: 'à refaire', photo: null, note: 2, date: '11/09/2026' },
            }),
          ...service,
        },
      },
      {
        provide: BienService,
        useValue: {
          consulter: () => of<FicheBien>({ etat: 'chargee', bien: unBien() }),
        },
      },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', id]]) } } },
      {
        provide: Router,
        useValue: {
          navigate: (adresse: unknown[]) => {
            navigations.push(adresse);
            return Promise.resolve(true);
          },
        },
      },
    ],
  });

  return runInInjectionContext(injector, () => new CommenterPage());
}

/** Un événement de champ de fichiers, tel que le navigateur le produit. */
function choixDe(fichiers: File[]): Event {
  const champ = { files: fichiers, value: 'C:\\faux\\sdb.jpg' } as unknown as HTMLInputElement;

  return { target: champ } as unknown as Event;
}

const unFichier = () => new File(['a'], 'sdb.jpg', { type: 'image/jpeg' });

describe('CommenterPage', () => {
  it('nomme le Bien qu’on commente', () => {
    // On arrive ici par la barre de navigation, parfois sans avoir la fiche
    // sous les yeux : commenter le mauvais Bien ne se repère qu'un mois plus
    // tard.
    const ecran = creerEcran();

    expect(ecran.libelle()).toBe(unBien().libelle);
  });

  describe('la saisie', () => {
    it('n’a rien à enregistrer tant que rien n’est saisi', () => {
      // Le bouton s'éteint là-dessus : un Commentaire vide ne dirait rien, et
      // l'API le refuserait de toute façon.
      const ecran = creerEcran();

      expect(ecran.renseigne()).toBe(false);
    });

    it('se contente d’un texte', () => {
      const ecran = creerEcran();

      ecran.ecrire('La salle de bain est à refaire');

      expect(ecran.renseigne()).toBe(true);
    });

    it('se contente d’une appréciation', () => {
      // Trois étoiles sur une chambre se passent de photo comme de mots.
      const ecran = creerEcran();

      ecran.noter(3);

      expect(ecran.saisie().note).toBe(3);
      expect(ecran.renseigne()).toBe(true);
    });

    it('se contente d’une photo', () => {
      // Un mur fissuré se passe de légende.
      const ecran = creerEcran();

      ecran.choisirPhoto(choixDe([unFichier()]));

      expect(ecran.renseigne()).toBe(true);
    });

    it('ne prend pas un texte d’espaces pour une saisie', () => {
      const ecran = creerEcran();

      ecran.ecrire('   ');

      expect(ecran.renseigne()).toBe(false);
    });

    it('retire l’appréciation quand on rappuie sur la même étoile', () => {
      // C'est le seul moyen de revenir sur un geste fait de travers, et une
      // note qu'on ne peut plus retirer se retrouverait enregistrée faute de
      // mieux.
      const ecran = creerEcran();

      ecran.noter(4);
      ecran.noter(4);

      expect(ecran.saisie().note).toBeNull();
    });

    it('change d’appréciation sans l’effacer', () => {
      const ecran = creerEcran();

      ecran.noter(4);
      ecran.noter(2);

      expect(ecran.saisie().note).toBe(2);
    });
  });

  describe('la photo', () => {
    it('montre un aperçu de ce qu’on vient de prendre', () => {
      // Sans lui, l'appareil photo se refermerait sur un écran inchangé.
      const ecran = creerEcran();

      ecran.choisirPhoto(choixDe([unFichier()]));

      expect(ecran.apercu()).toBe('blob:apercu');
      expect(ecran.nomPhoto()).toBe('sdb.jpg');
    });

    it('n’en garde qu’une : le Commentaire en porte une seule', () => {
      const ecran = creerEcran();

      ecran.choisirPhoto(choixDe([unFichier()]));
      ecran.choisirPhoto(choixDe([new File(['b'], 'cuisine.jpg', { type: 'image/jpeg' })]));

      expect(ecran.saisie().photo?.name).toBe('cuisine.jpg');
      // L'aperçu précédent est libéré : une `blob:` non révoquée retient le
      // fichier entier en mémoire, et une visite en produit autant qu'il y a
      // de pièces.
      expect(urlsRevoquees).toEqual(['blob:apercu']);
    });

    it('se retire avant même d’avoir enregistré', () => {
      const ecran = creerEcran();

      ecran.choisirPhoto(choixDe([unFichier()]));
      ecran.retirerPhoto();

      expect(ecran.saisie().photo).toBeNull();
      expect(ecran.apercu()).toBeNull();
      expect(urlsRevoquees).toEqual(['blob:apercu']);
    });

    it('ignore un choix vide, que le navigateur produit à l’annulation', () => {
      const ecran = creerEcran();

      ecran.choisirPhoto(choixDe([]));

      expect(ecran.saisie().photo).toBeNull();
      expect(ecran.apercu()).toBeNull();
    });

    it('vide le champ pour qu’on puisse reprendre le même cliché', () => {
      // Le navigateur ne signale qu'un changement de valeur : sans cela, le
      // second choix du même fichier ne déclencherait rien.
      const ecran = creerEcran();
      const evenement = choixDe([unFichier()]);

      ecran.choisirPhoto(evenement);

      expect((evenement.target as HTMLInputElement).value).toBe('');
    });
  });

  describe('l’enregistrement', () => {
    it('envoie les trois champs et ramène à la fiche', () => {
      // Le retour est la fin du geste : on a commenté, on referme, et le
      // carrousel de la fiche montre ce qu'on vient d'écrire.
      const navigations: unknown[][] = [];
      let envoye: AjoutCommentaire | undefined;

      const ecran = creerEcran(
        {
          ajouter: (_id, ajout) => {
            envoye = ajout;
            return of<AjoutCommentaireResultat>({
              ajoute: true,
              commentaire: { id: 3, texte: 'à refaire', photo: null, note: 2, date: '11/09' },
            });
          },
        },
        '12',
        navigations,
      );

      ecran.ecrire('à refaire');
      ecran.noter(2);
      ecran.enregistrer();

      expect(envoye?.texte).toBe('à refaire');
      expect(envoye?.note).toBe(2);
      expect(navigations).toEqual([[routeFicheBien(12)]]);
    });

    it('n’envoie rien tant que rien n’est saisi', () => {
      // Le garde vit ici et pas dans le seul `[disabled]` du gabarit : un
      // remaniement du HTML ne doit pas pouvoir le faire disparaître.
      let appelee = false;
      const ecran = creerEcran({
        ajouter: () => {
          appelee = true;
          return of<AjoutCommentaireResultat>({
            ajoute: true,
            commentaire: { id: 3, texte: null, photo: null, note: null, date: '11/09' },
          });
        },
      });

      ecran.enregistrer();

      expect(appelee).toBe(false);
    });

    it('reste sur l’écran quand l’API refuse, saisie intacte', () => {
      // Repartir effacerait ce qui vient d'être écrit devant la pièce qu'on
      // décrit : c'est très exactement ce qu'on ne peut pas se permettre.
      const navigations: unknown[][] = [];
      const ecran = creerEcran(
        {
          ajouter: () =>
            of<AjoutCommentaireResultat>({
              ajoute: false,
              erreurs: ['« sdb.jpg » dépasse 10 Mo'],
            }),
        },
        '1',
        navigations,
      );

      ecran.ecrire('à refaire');
      ecran.enregistrer();

      expect(ecran.erreurs()).toEqual(['« sdb.jpg » dépasse 10 Mo']);
      expect(ecran.saisie().texte).toBe('à refaire');
      expect(navigations).toEqual([]);
    });
  });
});
