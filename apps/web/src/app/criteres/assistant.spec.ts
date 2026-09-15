import { describe, expect, it } from 'vitest';
import {
  demarrer,
  passer,
  progression,
  questionCourante,
  questionsSuivantes,
  repondre,
  termine,
} from './assistant';
import { criteresNonRenseignes } from './valeurs';
import type { ValeursCriteres } from './valeurs';

/**
 * L'assistant de complétion : il enchaîne les Critères manquants un par un,
 * pendant la visite, où répondre à des questions courtes va plus vite que
 * viser les champs vides d'un formulaire (ADR-0008, #6).
 *
 * Ce module ne fait aucune entrée-sortie : il dit quelles questions restent
 * et dans quel ordre, et c'est l'écran qui enregistre. C'est ce qui rend
 * « interrompre l'assistant ne perd rien » vérifiable ici plutôt qu'au clic.
 */

/** Un Bien dont aucun Critère n'est renseigné : celui qui vient d'être créé. */
const RIEN_DE_RENSEIGNE: ValeursCriteres = {};

/**
 * Un Bien dont tout est renseigné sauf les Critères nommés — la façon de se
 * placer à deux questions de la fin sans écrire quatorze valeurs à la main.
 *
 * Les valeurs sortent de la définition et non d'une liste écrite ici : un
 * Critère ajouté ne doit pas faire mentir un test sur ce qu'il reste à poser.
 */
function aTousRenseignesSauf(manquants: readonly string[]): ValeursCriteres {
  return Object.fromEntries(
    criteresNonRenseignes(RIEN_DE_RENSEIGNE)
      .filter(({ id }) => !manquants.includes(id))
      .map(({ id }) => [id, 'une valeur']),
  );
}

describe('les Critères manquants', () => {
  it('propose tous les Critères d’un Bien qui vient d’être créé', () => {
    // Un Bien se crée avec son seul Libellé (ADR-0008) : à ce moment-là,
    // l'assistant a les quinze questions à poser.
    expect(criteresNonRenseignes(RIEN_DE_RENSEIGNE)).toHaveLength(15);
  });

  it('les propose dans l’ordre de la définition', () => {
    // L'ordre suit le déroulé d'une visite : le budget, puis le logement,
    // puis l'emplacement, puis le confort. Il ne doit pas dépendre de
    // l'ordre des clés reçues de l'API.
    const ids = criteresNonRenseignes(RIEN_DE_RENSEIGNE).map(({ id }) => id);

    expect(ids.slice(0, 4)).toEqual([
      'prixDemande',
      'taxeFonciere',
      'chargesCopropriete',
      'surfaceHabitable',
    ]);
  });

  it('écarte les Critères déjà renseignés', () => {
    const manquants = criteresNonRenseignes({ prixDemande: 250000, dpe: 'C' });

    expect(manquants.map(({ id }) => id)).not.toContain('prixDemande');
    expect(manquants.map(({ id }) => id)).not.toContain('dpe');
    expect(manquants).toHaveLength(13);
  });

  it('ne prend pas un Critère à zéro pour un Critère manquant', () => {
    // Zéro place de stationnement est une réponse : la reposer donnerait
    // l'impression que la précédente n'a pas été enregistrée.
    const manquants = criteresNonRenseignes({ capaciteStationnement: 0 });

    expect(manquants.map(({ id }) => id)).not.toContain('capaciteStationnement');
  });

  it('ne prend pas une chaîne vide pour une réponse', () => {
    // Une chaîne vide en base est un Critère jamais renseigné : l'API la
    // ramène à `null`, mais l'assistant ne doit pas dépendre de ce détour.
    expect(criteresNonRenseignes({ adresse: '' }).map(({ id }) => id)).toContain('adresse');
  });

  it('ne propose plus rien quand tout est renseigné', () => {
    const complet = Object.fromEntries(
      criteresNonRenseignes(RIEN_DE_RENSEIGNE).map(({ id }) => [id, 'une valeur']),
    );

    expect(criteresNonRenseignes(complet)).toEqual([]);
  });
});

describe('le déroulé de l’assistant', () => {
  it('commence par la première question manquante', () => {
    const assistant = demarrer({ prixDemande: 250000 });

    expect(questionCourante(assistant)?.id).toBe('taxeFonciere');
    expect(termine(assistant)).toBe(false);
  });

  it('passe à la question suivante une fois répondu', () => {
    const apres = repondre(demarrer(RIEN_DE_RENSEIGNE), 250000);

    expect(questionCourante(apres)?.id).toBe('taxeFonciere');
  });

  it('retient les réponses données', () => {
    const apres = repondre(demarrer(RIEN_DE_RENSEIGNE), 250000);

    expect(apres.reponses).toEqual({ prixDemande: 250000 });
  });

  it('passe une question sans rien enregistrer', () => {
    // Une question passée n'est pas une réponse vide : elle ne doit rien
    // écrire, sinon elle effacerait ce qui était là.
    const apres = passer(demarrer(RIEN_DE_RENSEIGNE));

    expect(questionCourante(apres)?.id).toBe('taxeFonciere');
    expect(apres.reponses).toEqual({});
  });

  it('ne repose pas une question passée dans la même session', () => {
    // Passer veut dire « pas maintenant » : revenir dessus au tour suivant
    // ferait tourner l'assistant en rond.
    let assistant = demarrer(RIEN_DE_RENSEIGNE);
    const premiere = questionCourante(assistant)?.id;

    assistant = passer(assistant);

    expect(questionCourante(assistant)?.id).not.toBe(premiere);
  });

  it('conserve les réponses déjà données quand une question est passée', () => {
    // C'est tout l'enjeu : interrompre l'assistant ne perd rien de ce qui a
    // été saisi jusque-là.
    let assistant = demarrer(RIEN_DE_RENSEIGNE);
    assistant = repondre(assistant, 250000);
    assistant = passer(assistant);

    expect(assistant.reponses).toEqual({ prixDemande: 250000 });
  });

  it('enregistre une réponse vidée comme une absence de valeur', () => {
    // Répondre « je ne sais pas » en effaçant le champ n'est pas passer la
    // question : c'est dire que le Critère n'a pas de valeur.
    const apres = repondre(demarrer(RIEN_DE_RENSEIGNE), null);

    expect(apres.reponses).toEqual({ prixDemande: null });
  });

  it('se termine une fois la dernière question traitée', () => {
    // Un Bien à qui il ne manque qu'un Critère : une question, puis fini.
    const presqueComplet = Object.fromEntries(
      criteresNonRenseignes(RIEN_DE_RENSEIGNE)
        .filter(({ id }) => id !== 'dpe')
        .map(({ id }) => [id, 'une valeur']),
    );

    const assistant = repondre(demarrer(presqueComplet), 'C');

    expect(termine(assistant)).toBe(true);
    expect(questionCourante(assistant)).toBeUndefined();
  });

  it('est terminé d’emblée sur un Bien complet', () => {
    const complet = Object.fromEntries(
      criteresNonRenseignes(RIEN_DE_RENSEIGNE).map(({ id }) => [id, 'une valeur']),
    );

    expect(termine(demarrer(complet))).toBe(true);
  });

  it('ne fige pas les questions sur l’état de départ', () => {
    // Les questions sont calculées au démarrage : l'assistant ne doit pas
    // reposer un Critère renseigné entre-temps par la fiche, ni oublier
    // celui qu'il a lui-même rempli.
    let assistant = demarrer(RIEN_DE_RENSEIGNE);
    assistant = repondre(assistant, 250000);

    expect(questionCourante(assistant)?.id).not.toBe('prixDemande');
  });
  it('ne range pas une réponse vidée parmi les questions passées', () => {
    // Les deux écartent le Critère du parcours, mais ne disent pas la même
    // chose : « je ne sais pas encore » n'est pas « ce Critère n'a pas de
    // valeur ». Revenir un jour sur les seules questions laissées de côté
    // demande que l'état les distingue.
    const vide = repondre(demarrer(RIEN_DE_RENSEIGNE), null);
    const passee = passer(demarrer(RIEN_DE_RENSEIGNE));

    expect(vide.passes).toEqual([]);
    expect(vide.reponses).toEqual({ prixDemande: null });
    expect(passee.passes).toEqual(['prixDemande']);
    expect(passee.reponses).toEqual({});
  });

  it('ne repose pas une question répondue à vide', () => {
    // Elle reste manquante au sens de la fiche, mais l'acheteur vient d'y
    // répondre : la reposer ferait tourner l'assistant en rond.
    const apres = repondre(demarrer(RIEN_DE_RENSEIGNE), null);

    expect(questionCourante(apres)?.id).toBe('taxeFonciere');
  });
});

describe('ce que l’assistant annonce de la suite', () => {
  it('annonce les deux questions qui suivent celle posée', () => {
    // Annoncer sert à anticiper : savoir que la surface habitable vient
    // après permet de la chercher sur l'annonce pendant qu'on répond à la
    // question courante (#121).
    const suivantes = questionsSuivantes(demarrer(RIEN_DE_RENSEIGNE));

    expect(suivantes.map(({ id }) => id)).toEqual(['taxeFonciere', 'chargesCopropriete']);
  });

  it('n’annonce pas la question posée parmi celles qui suivent', () => {
    const assistant = demarrer(RIEN_DE_RENSEIGNE);

    expect(questionsSuivantes(assistant).map(({ id }) => id)).not.toContain(
      questionCourante(assistant)?.id,
    );
  });

  it('n’annonce rien après la dernière question', () => {
    // La dernière ne promet rien après elle : une phrase « puis… » suivie de
    // rien serait une promesse non tenue.
    const assistant = demarrer(aTousRenseignesSauf(['dpe']));

    expect(questionCourante(assistant)?.id).toBe('dpe');
    expect(questionsSuivantes(assistant)).toEqual([]);
  });

  it('n’annonce qu’une question quand il n’en reste qu’une après celle posée', () => {
    const assistant = demarrer(aTousRenseignesSauf(['surfaceHabitable', 'dpe']));

    expect(questionsSuivantes(assistant).map(({ id }) => id)).toEqual(['dpe']);
  });

  it('n’annonce plus rien une fois l’assistant terminé', () => {
    const complet = aTousRenseignesSauf([]);

    expect(questionsSuivantes(demarrer(complet))).toEqual([]);
  });

  it('avance d’un cran à chaque réponse', () => {
    const apres = repondre(demarrer(RIEN_DE_RENSEIGNE), 250000);

    expect(questionsSuivantes(apres).map(({ id }) => id)).toEqual([
      'chargesCopropriete',
      'surfaceHabitable',
    ]);
  });

  it('écarte une question passée de ce qu’elle annonce', () => {
    // Passée, elle ne sera pas reposée : l'annoncer promettrait une question
    // qui ne viendra pas.
    let assistant = demarrer(RIEN_DE_RENSEIGNE);
    assistant = passer(assistant);

    expect(questionsSuivantes(assistant).map(({ id }) => id)).toEqual([
      'chargesCopropriete',
      'surfaceHabitable',
    ]);
  });
});

describe('où en est la saisie pendant l’assistant', () => {
  it('compte les Critères renseignés du Bien, sur le total de la définition', () => {
    const assistant = demarrer({ prixDemande: 250000, dpe: 'C' });

    expect(progression(assistant)).toEqual({ renseignes: 2, total: 15, part: 2 / 15 });
  });

  it('avance à chaque réponse donnée', () => {
    // C'est ce qui décide de continuer : voir la jauge bouger dit qu'il
    // reste peu, là où une jauge figée dit qu'on répond pour rien.
    const apres = repondre(demarrer(RIEN_DE_RENSEIGNE), 250000);

    expect(progression(apres).renseignes).toBe(1);
  });

  it('n’avance pas sur une question passée', () => {
    // Passer n'enregistre rien : le Critère reste à demander, et la jauge
    // mentirait en avançant.
    const apres = passer(demarrer(RIEN_DE_RENSEIGNE));

    expect(progression(apres).renseignes).toBe(0);
  });

  it('n’avance pas sur une réponse vidée', () => {
    // « Ce Critère n'a pas de valeur » sort la question du parcours sans
    // renseigner quoi que ce soit.
    const apres = repondre(demarrer(RIEN_DE_RENSEIGNE), null);

    expect(progression(apres).renseignes).toBe(0);
  });

  it('dit la saisie complète quand plus rien ne manque', () => {
    const progres = progression(demarrer(aTousRenseignesSauf([])));

    expect(progres.renseignes).toBe(progres.total);
    expect(progres.part).toBe(1);
  });
});
