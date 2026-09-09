import type { Critere } from './critere';
import type { ValeurCritere } from './comparaison';
import { criteresNonRenseignes, estRenseigne, type ValeursCriteres } from './valeurs';

/**
 * L'assistant de complétion : les Critères manquants, enchaînés un par un.
 *
 * Il est pensé pour la visite, où répondre à des questions courtes va plus
 * vite que viser les champs vides d'un formulaire (ADR-0008). Il n'est
 * jamais imposé : la fiche le lance, et l'interrompre ne perd rien.
 *
 * Ce module ne fait aucune entrée-sortie et ne dépend pas d'Angular. Il dit
 * quelles questions restent et dans quel ordre ; c'est l'écran qui
 * enregistre. Séparés ainsi, « une question peut être passée » et
 * « interrompre ne perd rien » se vérifient sans monter de composant.
 *
 * L'état est une valeur, jamais mutée : chaque geste rend un nouvel état.
 * L'écran n'a donc qu'un signal à remplacer, et un retour en arrière — s'il
 * arrive un jour — ne demandera pas de défaire quoi que ce soit.
 */
export interface Assistant {
  /**
   * Les valeurs du Bien telles qu'elles étaient au démarrage, augmentées des
   * réponses données depuis. C'est sur elles que se calcule ce qui manque
   * encore, et non sur l'état de départ figé : un Critère répondu ne doit
   * pas revenir.
   */
  readonly valeurs: ValeursCriteres;

  /**
   * Ce que l'acheteur a saisi pendant cette session d'assistant, et rien
   * d'autre. C'est exactement la mise à jour partielle à envoyer à l'API :
   * les Critères non transmis ne sont pas touchés (#6).
   *
   * Une question passée n'y figure pas — c'est toute la différence avec une
   * réponse vidée, qui y figure à `null` et efface la valeur.
   */
  readonly reponses: Readonly<Record<string, ValeurCritere>>;

  /**
   * Les Critères passés pendant cette session. Passer veut dire « pas
   * maintenant » : les reposer au tour suivant ferait tourner l'assistant en
   * rond, alors qu'ils restent bien manquants.
   */
  readonly passes: readonly string[];
}

/** Un assistant prêt à poser sa première question sur ce Bien. */
export function demarrer(valeurs: ValeursCriteres): Assistant {
  return { valeurs, reponses: {}, passes: [] };
}

/**
 * Les Critères d'un Bien restés sans valeur, dans l'ordre de la définition.
 *
 * L'ordre suit le déroulé d'une visite — budget, logement, emplacement,
 * confort — et non l'ordre des clés reçues de l'API, qui n'en a aucun.
 */
export function criteresManquants(valeurs: ValeursCriteres): readonly Critere[] {
  return criteresNonRenseignes(valeurs);
}

/**
 * Les questions qu'il reste à poser : les Critères encore manquants, sauf
 * ceux que l'acheteur a passés.
 */
function questionsRestantes(assistant: Assistant): readonly Critere[] {
  return criteresManquants(assistant.valeurs).filter(
    (critere) => !assistant.passes.includes(critere.id),
  );
}

/** Le Critère sur lequel l'assistant interroge, ou `undefined` s'il a fini. */
export function questionCourante(assistant: Assistant): Critere | undefined {
  return questionsRestantes(assistant)[0];
}

/** Vrai quand il ne reste plus rien à demander. */
export function termine(assistant: Assistant): boolean {
  return questionCourante(assistant) === undefined;
}

/**
 * La réponse à la question courante.
 *
 * `null` est une réponse — « ce Critère n'a pas de valeur » — et non un
 * saut : elle est enregistrée, et effacera la valeur si le Bien en avait
 * une. Sauter, c'est `passer`.
 *
 * Sans question courante, l'assistant est rendu tel quel : répondre à rien
 * ne doit écrire nulle part.
 */
export function repondre(assistant: Assistant, valeur: ValeurCritere): Assistant {
  const question = questionCourante(assistant);

  if (!question) {
    return assistant;
  }

  return {
    ...assistant,
    // La valeur rejoint l'état du Bien : la question ne se reposera pas, et
    // seulement si la réponse en est vraiment une. Répondre `null` laisse le
    // Critère manquant, mais `passes` l'écarte de la suite du parcours.
    valeurs: { ...assistant.valeurs, [question.id]: valeur },
    reponses: { ...assistant.reponses, [question.id]: valeur },
    passes: estRenseigne(valeur) ? assistant.passes : [...assistant.passes, question.id],
  };
}

/**
 * La question courante, laissée de côté.
 *
 * Rien n'est enregistré : le Critère reste manquant, et la fiche continuera
 * de le signaler. C'est ce qui distingue « je ne sais pas encore » de « ce
 * Critère n'a pas de valeur ».
 */
export function passer(assistant: Assistant): Assistant {
  const question = questionCourante(assistant);

  if (!question) {
    return assistant;
  }

  return { ...assistant, passes: [...assistant.passes, question.id] };
}
