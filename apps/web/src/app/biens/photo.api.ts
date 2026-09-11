/**
 * Une photo telle que l'API la renvoie (#13).
 *
 * Cette forme décrit le contrat HTTP et non ce que l'écran affiche : elle
 * reste confinée au service et à l'adapter, qui la traduisent vers le modèle
 * d'affichage de `photo.ts` (ADR-0010).
 *
 * Les noms de fichiers y figurent parce que l'API les rend, mais aucun écran
 * ne les montre : c'est l'adapter qui les laisse tomber, et les adresses
 * qu'il compose qui arrivent à l'écran.
 */
export interface PhotoApi {
  id: number;
  bienId: number;
  fichier: string;
  fichierVignette: string;
  rang: number;
  createdAt: string;
  updatedAt: string;
}
