import type { Bien, CreationBien } from './bien';
import type { BienApi, CreationBienApi } from './bien.api';

/**
 * La traduction entre les formes échangées avec l'API et les modèles que
 * l'interface affiche. C'est le seul endroit du front qui connaît les deux :
 * partout ailleurs, on ne manipule que des `Bien`.
 */

/** Un Bien tel que l'API l'envoie, ramené à ce que l'interface affiche. */
export function versBien({ id, libelle, urlAnnonce }: BienApi): Bien {
  return { id, libelle, urlAnnonce };
}

/**
 * Une saisie de formulaire, ramenée à ce que l'API attend. Une URL laissée
 * vide n'est pas envoyée : c'est l'absence d'Annonce, pas une chaîne vide.
 */
export function versCreationBienApi({ libelle, urlAnnonce }: CreationBien): CreationBienApi {
  const urlSaisie = urlAnnonce.trim();

  return {
    libelle: libelle.trim(),
    ...(urlSaisie ? { urlAnnonce: urlSaisie } : {}),
  };
}
