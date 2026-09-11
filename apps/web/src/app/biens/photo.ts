/**
 * Une photo d'un Bien, telle que l'écran l'affiche (#13).
 *
 * Le modèle ne porte **que ce qu'un écran montre** (ADR-0010) : deux
 * adresses et un texte de remplacement. Ni nom de fichier, ni rang, ni dates
 * — l'ordre est celui du tableau que l'API rend, et rien n'affiche le reste.
 */
export interface Photo {
  id: number;

  /** L'adresse de la version consultable, celle qu'ouvre la galerie. */
  url: string;

  /**
   * L'adresse de la vignette, celle que portent la liste et les cartes.
   *
   * Deux adresses et non une taille à choisir à l'affichage : c'est
   * l'endroit où la photo s'affiche qui sait laquelle il lui faut, et le
   * `<img>` ne doit pas avoir à la composer.
   */
  urlVignette: string;
}

/**
 * Ce que l'acheteur envoie : les fichiers choisis, tels que le champ de
 * sélection les donne.
 *
 * Un tableau et non un fichier : pendant une visite on prend une série, et
 * la boîte de sélection d'un téléphone permet d'en cocher plusieurs.
 */
export interface AjoutPhotos {
  fichiers: readonly File[];
}
