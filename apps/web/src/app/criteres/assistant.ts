import type { Critere } from './critere';
import type { ValeurCritere } from './comparaison';
import {
  completude,
  criteresNonRenseignes,
  type Completude,
  type ValeursCriteres,
} from './valeurs';

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
   *
   * Distinct de `reponses` : un Critère répondu à vide y figure — l'acheteur
   * a dit qu'il n'a pas de valeur —, un Critère passé non. Les confondre
   * rendrait impossible de revenir un jour sur les seules questions
   * réellement laissées de côté.
   */
  readonly passes: readonly string[];
}

/** Un assistant prêt à poser sa première question sur ce Bien. */
export function demarrer(valeurs: ValeursCriteres): Assistant {
  return { valeurs, reponses: {}, passes: [] };
}

/**
 * Les questions qu'il reste à poser : les Critères encore manquants, sauf
 * ceux dont l'acheteur s'est déjà occupé pendant cette session — qu'il les
 * ait passés, ou répondus à vide.
 *
 * Les deux sortent du parcours pour la même raison — les reposer ferait
 * tourner l'assistant en rond — mais restent distinctes dans l'état : seul
 * `passes` dit ce qui a été laissé de côté.
 *
 * L'ordre est celui de la définition, qui suit le déroulé d'une visite —
 * budget, logement, emplacement, confort — et non l'ordre des clés reçues de
 * l'API, qui n'en a aucun.
 */
function questionsRestantes(assistant: Assistant): readonly Critere[] {
  return criteresNonRenseignes(assistant.valeurs).filter(
    (critere) =>
      !assistant.passes.includes(critere.id) && !Object.hasOwn(assistant.reponses, critere.id),
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
 * Combien de questions s'annoncent sous les réponses possibles.
 *
 * Deux, parce que c'est ce qu'il faut pour anticiper — « surface habitable »
 * prépare à chercher le chiffre sur l'annonce pendant qu'on répond à la
 * précédente — et pas davantage : au-delà, la phrase s'allonge plus qu'elle
 * n'informe, et personne ne retient quatre questions d'avance (#121).
 */
const QUESTIONS_ANNONCEES = 2;

/**
 * Ce qui vient après la question posée, dans l'ordre où l'assistant le
 * posera.
 *
 * L'acheteur répond autrement quand il sait ce qui suit : il cherche la
 * surface habitable sur l'annonce pendant qu'il saisit le prix. C'est le
 * gain de l'annonce, et c'est pourquoi elle porte les libellés et non un
 * décompte — « encore deux » n'aide à rien préparer.
 *
 * Rendu vide sur la dernière question comme sur un assistant terminé : rien
 * ne suit, et l'écran n'a donc rien à promettre.
 *
 * Se dérive de la file des Critères restants, sans état ajouté : une
 * question passée ou répondue en sort d'elle-même, et l'annonce ne promet
 * jamais une question qui ne viendra pas.
 */
export function questionsSuivantes(assistant: Assistant): readonly Critere[] {
  return questionsRestantes(assistant).slice(1, 1 + QUESTIONS_ANNONCEES);
}

/**
 * Où en est la saisie du Bien, au moment où l'assistant en est là.
 *
 * C'est la même mesure que celle de la carte et de la fiche — le `7 / 16` et
 * sa jauge —, prise sur les valeurs que l'assistant tient à jour : chaque
 * réponse la fait avancer sans qu'il faille recharger le Bien.
 *
 * Elle compte ce qui est renseigné, et non ce que le parcours a traité.
 * L'écart est voulu : passer une question et y répondre à vide sortent
 * toutes deux du parcours, mais ne renseignent rien — le Critère reste à
 * demander à l'agence, et une jauge qui avancerait quand même mentirait sur
 * ce qui manque encore.
 */
export function progression(assistant: Assistant): Completude {
  return completude(assistant.valeurs);
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
    // La valeur rejoint l'état du Bien, ce qui suffit à ne pas reposer la
    // question quand la réponse en est une. Répondre à vide laisse le Critère
    // manquant : c'est `reponses`, où la clé figure désormais, qui l'écarte
    // de la suite du parcours — et non `passes`, réservé à ce qui a vraiment
    // été laissé de côté.
    valeurs: { ...assistant.valeurs, [question.id]: valeur },
    reponses: { ...assistant.reponses, [question.id]: valeur },
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
