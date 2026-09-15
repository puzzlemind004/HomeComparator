import { describe, expect, it } from 'vitest';
import { versCommentaire } from './commentaire.adapter';
import type { CommentaireApi } from './commentaire.api';

function commentaireApi(surcharges: Partial<CommentaireApi> = {}): CommentaireApi {
  return {
    id: 3,
    bienId: 1,
    texte: 'La salle de bain est à refaire',
    photoId: null,
    photo: null,
    note: 2,
    createdAt: '2026-09-11T10:30:00.000+00:00',
    updatedAt: '2026-09-11T10:30:00.000+00:00',
    ...surcharges,
  };
}

describe('versCommentaire', () => {
  it('ne garde que ce qu’un écran montre', () => {
    // Ni `bienId`, ni `photoId`, ni `updatedAt` : rien à l'écran ne les
    // affiche, et les traîner jusqu'au gabarit ferait croire qu'ils servent
    // (ADR-0010).
    const commentaire = versCommentaire(commentaireApi());

    expect(Object.keys(commentaire).sort()).toEqual(['date', 'id', 'note', 'photo', 'texte']);
  });

  it('compose les deux adresses de la photo', () => {
    // La vignette pour le carrousel, la version consultable pour qui veut la
    // regarder : c'est l'endroit qui sait laquelle il lui faut (#13).
    const commentaire = versCommentaire(
      commentaireApi({
        photoId: 7,
        photo: {
          id: 7,
          bienId: 1,
          fichier: 'abc.jpg',
          fichierVignette: 'abc.vignette.jpg',
          rang: 0,
          createdAt: '2026-09-11T10:30:00.000+00:00',
          updatedAt: '2026-09-11T10:30:00.000+00:00',
        },
      }),
    );

    expect(commentaire.photo).toEqual({
      url: '/api/biens/1/photos/7',
      urlVignette: '/api/biens/1/photos/7?taille=vignette',
    });
  });

  it('accepte un Commentaire sans photo', () => {
    // Les trois champs sont facultatifs : trois étoiles sur une chambre se
    // passent de photo.
    expect(versCommentaire(commentaireApi()).photo).toBeNull();
  });

  it('écrit la date pour être lue, l’heure comprise', () => {
    // Une visite produit plusieurs Commentaires dans le même après-midi : une
    // date nue ne dirait pas lequel a été pris devant la cuisine.
    //
    // Le motif ne fixe ni le jour ni l'heure : ils dépendent du fuseau de la
    // machine, et c'est la **forme** — jour, mois, année, puis heure et
    // minute — qui est ce que l'adapter décide.
    const commentaire = versCommentaire(
      commentaireApi({ createdAt: '2026-09-11T10:30:00.000+00:00' }),
    );

    expect(commentaire.date).toMatch(/^\d{2}\/\d{2}\/2026\D+\d{2}:\d{2}$/);
  });
});
