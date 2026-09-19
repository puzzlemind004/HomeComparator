import { beforeEach, describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { of, type Observable } from 'rxjs';
import { TableauDeBordPage } from './tableau-de-bord-page';
import { BienService, type ListeBiens } from './bien.service';
import { CommentaireService, type Commentaires } from './commentaire.service';
import { Preferences } from './preferences.service';
import { unBien } from './bien.test-helper';
import type { Bien } from './bien';
import type { Commentaire } from './commentaire';

/**
 * L'écran est construit hors TestBed comme ses voisins. Les préférences sont
 * le **vrai** service : c'est lui qui porte les poids dont le classement
 * dépend, et le doubler reviendrait à réécrire le calcul dans le test.
 *
 * Les Commentaires sont rendus Bien par Bien, comme l'API les sert.
 */
function creerPage(
  biens: Bien[] | null = [],
  commentairesParBien: Record<number, Commentaire[]> = {},
) {
  const liste: Observable<ListeBiens> = of(
    biens === null ? { chargee: false } : { chargee: true, biens },
  );

  const injector = Injector.create({
    providers: [
      Preferences,
      { provide: BienService, useValue: { lister: () => liste } },
      {
        provide: CommentaireService,
        useValue: {
          lister: (bienId: number): Observable<Commentaires> =>
            of({ chargee: true, commentaires: commentairesParBien[bienId] ?? [] }),
        },
      },
    ],
  });

  return runInInjectionContext(injector, () => ({
    page: new TableauDeBordPage(),
    preferences: injector.get(Preferences),
  }));
}

function commentaire(id: number, note: number | null, texte = 'la cuisine'): Commentaire {
  return { id, texte, photo: null, note, date: '12 mars 2026' };
}

const abordable = unBien({
  id: 1,
  libelle: 'le T3 avec la terrasse',
  criteres: { prixDemande: 200000, surfaceHabitable: 60 },
});

const spacieux = unBien({
  id: 2,
  libelle: 'celui avec la cuisine refaite',
  criteres: { prixDemande: 300000, surfaceHabitable: 90 },
});

describe('TableauDeBordPage', () => {
  beforeEach(() => localStorage.clear());

  it('classe les Biens du carnet dès l’ouverture, sans rien avoir coché', () => {
    // L'écran s'atteint par la navigation : il doit montrer quelque chose
    // avant qu'on ait touché à un seul curseur.
    const { page } = creerPage([abordable, spacieux]);

    expect(page.classementAffiche()).toBe(true);
    expect(page.barres()).toHaveLength(2);
  });

  it('donne un rang à chaque Bien, à partir de 1', () => {
    const { page } = creerPage([abordable, spacieux]);

    expect(page.lignes().map((ligne) => ligne.rang)).toEqual([1, 2]);
  });

  it('reclasse quand un poids bouge', () => {
    // C'est tout l'objet de l'écran : le Bien 1 gagne sur le prix, le Bien 2
    // sur la surface, et le curseur décide lequel prime.
    const { page, preferences } = creerPage([abordable, spacieux]);

    preferences.poser('prixDemande', 5);
    preferences.poser('surfaceHabitable', 0);
    expect(page.lignes()[0].porteurId).toBe(1);

    preferences.poser('prixDemande', 0);
    preferences.poser('surfaceHabitable', 5);
    expect(page.lignes()[0].porteurId).toBe(2);
  });

  it('ne propose pas de curseur pour un Critère qui ne se classe pas', () => {
    // Rien ne dit qu'une adresse ou un chauffage vaut mieux qu'un autre :
    // les pondérer serait demander de répondre à une question sans réponse.
    const { page } = creerPage([abordable]);

    const ponderables = page.criteresPonderables().map((notable) => notable.id);

    expect(ponderables).not.toContain('adresse');
    expect(ponderables).not.toContain('typeChauffage');
    expect(ponderables).toContain('prixDemande');
  });

  it('dit qu’aucun poids n’a été posé tant qu’on n’a touché à rien', () => {
    const { page, preferences } = creerPage([abordable, spacieux]);

    expect(page.aucunPoidsPose()).toBe(true);

    preferences.poser('prixDemande', 4);

    expect(page.aucunPoidsPose()).toBe(false);
  });

  it('met à part les Biens qu’aucun Critère pondéré ne renseigne', () => {
    // Un Bien vide n'est pas dernier, il est à part : le poser à zéro
    // ferait passer une saisie en retard pour un défaut.
    const vide = unBien({ id: 3, libelle: 'celui qu’on vient de repérer' });
    const { page } = creerPage([abordable, vide]);

    expect(page.sansScore().map((ligne) => ligne.porteurId)).toEqual([3]);
    expect(page.barres().find((barre) => barre.bienId === 3)?.score).toBeNull();
  });

  it('ne classe rien sur un carnet vide', () => {
    const { page } = creerPage([]);

    expect(page.biens()).toEqual([]);
    expect(page.classementAffiche()).toBe(false);
  });

  it('distingue l’API muette d’un carnet vide', () => {
    // Une API qui n'a pas répondu n'a aucun Bien à rapporter, et l'écran ne
    // doit pas l'annoncer comme un carnet vide.
    const { page } = creerPage(null);

    expect(page.chargee()).toBe(false);
  });

  it('fait d’un thème un Critère pondérable', () => {
    // C'est ce qui fait entrer les Commentaires dans le score (#126).
    const { page, preferences } = creerPage([abordable, spacieux], {
      1: [commentaire(10, 5)],
      2: [commentaire(20, 2)],
    });

    const themeId = preferences.creerTheme('Cuisine');
    expect(themeId).not.toBeNull();

    preferences.basculerRattachement(10, 1, themeId as string);
    preferences.basculerRattachement(20, 2, themeId as string);

    expect(page.themesPonderables().map((notable) => notable.libelle)).toEqual(['Cuisine']);
    expect(page.notables().some((notable) => notable.id === themeId)).toBe(true);
  });

  it('classe selon un thème quand lui seul pèse', () => {
    // Le Bien 2 est le plus cher et le mieux noté : à poids du thème seul,
    // il doit passer devant.
    const { page, preferences } = creerPage([abordable, spacieux], {
      1: [commentaire(10, 1)],
      2: [commentaire(20, 5)],
    });

    const themeId = preferences.creerTheme('Cuisine') as string;

    preferences.basculerRattachement(10, 1, themeId);
    preferences.basculerRattachement(20, 2, themeId);

    for (const notable of page.criteresPonderables()) {
      preferences.poser(notable.id, 0);
    }

    expect(page.lignes()[0].porteurId).toBe(2);
  });

  it('ne propose au rattachement que les Commentaires notés', () => {
    // Un Commentaire sans étoiles ne pèse rien dans une moyenne : le
    // proposer ferait croire qu'il compte.
    const { page } = creerPage([abordable], {
      1: [commentaire(10, 4), commentaire(11, null)],
    });

    expect(page.commentairesNotesDe(1).map((c) => c.id)).toEqual([10]);
  });

  it('bascule un rattachement, et le retire au second clic', () => {
    const { page, preferences } = creerPage([abordable], { 1: [commentaire(10, 4)] });

    const themeId = preferences.creerTheme('Cuisine') as string;

    page.basculerRattachement(10, 1, themeId);
    expect(page.estRattache(10, themeId)).toBe(true);

    page.basculerRattachement(10, 1, themeId);
    expect(page.estRattache(10, themeId)).toBe(false);
  });

  it('déplie un Bien à la fois', () => {
    const { page } = creerPage([abordable, spacieux]);

    page.basculerDepli(1);
    expect(page.bienDeplie()).toBe(1);

    page.basculerDepli(2);
    expect(page.bienDeplie()).toBe(2);

    page.basculerDepli(2);
    expect(page.bienDeplie()).toBeNull();
  });

  it('oublie les rattachements des Biens disparus du carnet', () => {
    // Un Bien supprimé emporte ses Commentaires : leurs rattachements ne
    // désignent plus rien.
    const { preferences } = creerPage([abordable], { 1: [commentaire(10, 4)] });

    const themeId = preferences.creerTheme('Cuisine') as string;
    preferences.basculerRattachement(10, 99, themeId);

    // Le chargement a déjà eu lieu au montage, sur un carnet qui ne contient
    // que le Bien 1 : le rattachement au Bien 99 n'a pas survécu.
    expect(preferences.rattachements().some((r) => r.bienId === 99)).toBe(true);

    preferences.oublierLesDisparus([1]);

    expect(preferences.rattachements().some((r) => r.bienId === 99)).toBe(false);
  });
});
