import { describe, expect, it } from 'vitest';
import {
  type Rattachement,
  type Theme,
  critereDuTheme,
  identifiantDeTheme,
  libelleDeThemeValide,
  moyenneDuTheme,
} from './themes';
import type { Commentaire } from '../biens/commentaire';

/** Un Commentaire réduit à ce que la moyenne d'un thème regarde. */
function commentaire(id: number, note: number | null): Commentaire {
  return { id, texte: null, photo: null, note, date: '12 mars 2026' };
}

function rattachement(commentaireId: number, bienId: number, themeId: string): Rattachement {
  return { commentaireId, bienId, themeId };
}

describe('moyenneDuTheme', () => {
  it('moyenne les Appréciations rattachées au thème', () => {
    const moyenne = moyenneDuTheme(
      'theme:cuisine',
      1,
      [commentaire(10, 4), commentaire(11, 5)],
      [rattachement(10, 1, 'theme:cuisine'), rattachement(11, 1, 'theme:cuisine')],
    );

    expect(moyenne).toBe(4.5);
  });

  it('ignore les Commentaires rattachés à un autre thème', () => {
    // Deux étoiles sur un mur fissuré et deux étoiles sur un quartier ne
    // disent pas la même chose : c'est tout l'objet du thème.
    const moyenne = moyenneDuTheme(
      'theme:cuisine',
      1,
      [commentaire(10, 5), commentaire(11, 1)],
      [rattachement(10, 1, 'theme:cuisine'), rattachement(11, 1, 'theme:voisinage')],
    );

    expect(moyenne).toBe(5);
  });

  it('ignore les Commentaires d’un autre Bien', () => {
    // Les rattachements sont tenus à plat : sans le Bien, un thème
    // ramasserait les étoiles de tout le carnet dans chaque colonne.
    const moyenne = moyenneDuTheme(
      'theme:cuisine',
      1,
      [commentaire(10, 5)],
      [rattachement(10, 2, 'theme:cuisine')],
    );

    expect(moyenne).toBeNull();
  });

  it('ignore les Commentaires sans Appréciation', () => {
    // Un texte et une photo décrivent sans juger : les compter pour zéro
    // ferait chuter un thème abondamment documenté.
    const moyenne = moyenneDuTheme(
      'theme:cuisine',
      1,
      [commentaire(10, 4), commentaire(11, null)],
      [rattachement(10, 1, 'theme:cuisine'), rattachement(11, 1, 'theme:cuisine')],
    );

    expect(moyenne).toBe(4);
  });

  it('ne rend rien quand le thème n’a aucune Appréciation sur ce Bien', () => {
    // `null` et non zéro, pour la raison qui fait qu'une Appréciation ne
    // descend pas à zéro : l'absence d'avis n'est pas un mauvais avis.
    expect(moyenneDuTheme('theme:cuisine', 1, [commentaire(10, 4)], [])).toBeNull();
  });

  it('ne rend rien quand le Bien n’a aucun Commentaire', () => {
    expect(moyenneDuTheme('theme:cuisine', 1, [], [])).toBeNull();
  });
});

describe('critereDuTheme', () => {
  it('fait un Critère où plus d’étoiles vaut mieux', () => {
    const critere = critereDuTheme({ id: 'theme:cuisine', libelle: 'Cuisine' });

    expect(critere.sensComparaison).toBe('plusGrandEstMeilleur');
    expect(critere.id).toBe('theme:cuisine');
    expect(critere.libelle).toBe('Cuisine');
  });
});

describe('identifiantDeTheme', () => {
  it('tire l’identifiant du libellé, sans accent ni espace', () => {
    expect(identifiantDeTheme('Luminosité du séjour', [])).toBe('theme:luminosite-du-sejour');
  });

  it('préfixe, pour ne jamais heurter un Critère saisi', () => {
    // Les poids des thèmes et ceux des Critères vivent dans la même carte :
    // un thème nommé « DPE » y écraserait autrement le poids du vrai DPE.
    expect(identifiantDeTheme('DPE', [])).toBe('theme:dpe');
  });

  it('distingue deux thèmes de même nom', () => {
    const existants: Theme[] = [{ id: 'theme:cuisine', libelle: 'Cuisine' }];

    expect(identifiantDeTheme('Cuisine', existants)).toBe('theme:cuisine-2');
  });

  it('continue de compter quand plusieurs homonymes existent', () => {
    const existants: Theme[] = [
      { id: 'theme:cuisine', libelle: 'Cuisine' },
      { id: 'theme:cuisine-2', libelle: 'Cuisine' },
    ];

    expect(identifiantDeTheme('Cuisine', existants)).toBe('theme:cuisine-3');
  });
});

describe('libelleDeThemeValide', () => {
  it('refuse un nom vide ou fait d’espaces', () => {
    expect(libelleDeThemeValide('')).toBe(false);
    expect(libelleDeThemeValide('   ')).toBe(false);
  });

  it('accepte un nom qui porte au moins un mot', () => {
    expect(libelleDeThemeValide('Voisinage')).toBe(true);
  });
});
