import { describe, expect, it } from 'vitest';
import { versPhoto } from './photo.adapter';
import type { PhotoApi } from './photo.api';

function photoApi(surcharges: Partial<PhotoApi> = {}): PhotoApi {
  return {
    id: 7,
    bienId: 3,
    fichier: 'abc.jpg',
    fichierVignette: 'abc.vignette.jpg',
    rang: 0,
    createdAt: '2026-09-11T10:00:00.000+00:00',
    updatedAt: '2026-09-11T10:00:00.000+00:00',
    ...surcharges,
  };
}

describe('versPhoto', () => {
  it('compose les deux adresses à partir des identifiants', () => {
    // C'est ici, et nulle part ailleurs, que l'adresse se compose : un
    // `<img>` qui la construirait lui-même ferait de chaque écran un endroit
    // de plus à corriger si la route changeait (ADR-0010).
    const photo = versPhoto(photoApi());

    expect(photo.url).toBe('/api/biens/3/photos/7');
    expect(photo.urlVignette).toBe('/api/biens/3/photos/7?taille=vignette');
  });

  it('ne porte que ce qu’un écran affiche', () => {
    // Ni nom de fichier, ni rang, ni dates : le modèle d'affichage ne
    // recopie pas la forme de l'API (ADR-0010).
    const photo = versPhoto(photoApi());

    expect(Object.keys(photo).sort()).toEqual(['id', 'url', 'urlVignette']);
  });
});
