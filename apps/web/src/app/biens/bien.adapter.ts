import { CRITERES } from '../criteres/definition';
import { CHAMPS_STATUT, STATUT_INITIAL, statutParValeur } from '../criteres/statut';
import type { Bien, CreationBien, ModificationBien } from './bien';
import type { BienApi, CreationBienApi, ModificationBienApi } from './bien.api';

/**
 * La traduction entre les formes échangées avec l'API et les modèles que
 * l'interface affiche. C'est le seul endroit du front qui connaît les deux :
 * partout ailleurs, on ne manipule que des `Bien`.
 */

/**
 * Un Bien tel que l'API l'envoie, ramené à ce que l'interface affiche.
 *
 * Les Critères sont rassemblés dans une carte, en parcourant la définition
 * plutôt que la charge utile : c'est la définition qui dit ce qu'est un
 * Critère, et un champ que l'API rendrait sans qu'aucun Critère le déclare
 * — l'`id`, les dates — n'a rien à faire dans la fiche.
 *
 * Un Critère que l'API ne rendrait pas est ramené à `null`, et non laissé
 * absent : la fiche affiche une ligne par Critère de la définition, et
 * « pas encore renseigné » est ce qu'elle doit y lire.
 */
export function versBien(bienApi: BienApi): Bien {
  const { id, libelle, urlAnnonce, statut } = bienApi;

  return {
    id,
    libelle,
    urlAnnonce,
    /**
     * Un Statut que la définition ne connaît pas est ramené au Statut
     * initial. La fiche s'en sert pour décider quels champs afficher
     * (ADR-0002) : sans valeur exploitable, elle s'en tiendrait à ce dont
     * elle est sûre, et le sélecteur n'aurait aucune option sélectionnée.
     *
     * C'est un cas que l'API n'a pas à produire — son validateur refuse
     * tout ce qui n'est pas une étape connue — mais les deux côtés ne
     * partagent aucune source (ADR-0010), et c'est ici que la divergence
     * s'arrête plutôt qu'à l'écran.
     */
    statut: statutParValeur(statut)?.valeur ?? STATUT_INITIAL,
    champsStatut: Object.fromEntries(
      CHAMPS_STATUT.map((champ) => [champ.id, bienApi[champ.id] ?? null]),
    ),
    criteres: Object.fromEntries(
      CRITERES.map((critere) => [critere.id, bienApi[critere.id] ?? null]),
    ),
  };
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

/**
 * Une modification, ramenée à ce que l'API attend.
 *
 * Les deux formes coïncident déjà — un champ par identifiant de Critère,
 * lequel est aussi le nom du champ côté API. La fonction existe quand même :
 * elle est le point où la traduction se ferait si les deux divergeaient, et
 * sans elle le service enverrait un modèle d'affichage tel quel, ce
 * qu'ADR-0010 écarte explicitement.
 *
 * Les espaces de bordure d'une saisie de texte sont retirés ici : un champ
 * rempli d'espaces vaut « pas renseigné », et doit arriver à `null` plutôt
 * que de créer une valeur qui n'en est pas une.
 */
export function versModificationBienApi(modification: ModificationBien): ModificationBienApi {
  return Object.fromEntries(
    Object.entries(modification).map(([champ, valeur]) => {
      if (typeof valeur !== 'string') {
        return [champ, valeur];
      }

      const saisie = valeur.trim();

      return [champ, saisie === '' ? null : saisie];
    }),
  );
}
