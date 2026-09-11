import { describe, expect, it } from 'vitest';
import { urlBien, urlBiens, urlPhoto, urlPhotos } from './routes';

/**
 * Les adresses de l'API sont composées à un seul endroit (ADR-0010) : le
 * front et l'API ne partageant aucune source, rien ne vérifie la forme des
 * chemins à la compilation, et ces tests sont ce qui la fixe.
 */
describe('routes', () => {
  it('compose les adresses des Biens', () => {
    expect(urlBiens()).toBe('/api/biens');
    expect(urlBien(3)).toBe('/api/biens/3');
  });

  it('compose les adresses des photos sous leur Bien', () => {
    // L'adresse porte les deux identifiants : l'API vérifie les deux, sans
    // quoi connaître celui d'une photo suffirait à la lire sous n'importe
    // quel Bien (#13).
    expect(urlPhotos(3)).toBe('/api/biens/3/photos');
    expect(urlPhoto(3, 7)).toBe('/api/biens/3/photos/7');
  });

  it('préfixe tout par /api, que nginx détourne vers l’API', () => {
    const adresses = [urlBiens(), urlBien(1), urlPhotos(1), urlPhoto(1, 2)];

    expect(adresses.every((adresse) => adresse.startsWith('/api/'))).toBe(true);
  });
});
