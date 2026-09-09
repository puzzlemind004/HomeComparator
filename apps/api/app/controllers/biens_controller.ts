import type { HttpContext } from '@adonisjs/core/http'
import Bien from '#models/bien'
import { champInconnu, creerBienValidator, modifierBienValidator } from '#validators/bien'
import { PROPRIETAIRE_UNIQUE } from '#services/proprietaire'

/**
 * Les Biens : les créer avec leur seul Libellé, les retrouver dans une
 * liste, consulter la fiche de l'un d'eux et y modifier n'importe quel
 * Critère. C'est la boucle de repérage — celle qui doit tenir en quelques
 * secondes le soir devant une annonce — puis la complétion, qui vient plus
 * tard, au téléphone ou pendant la visite (ADR-0008).
 */
export default class BiensController {
  /** Tous les Biens enregistrés, du plus récemment repéré au plus ancien. */
  async index({ response }: HttpContext) {
    const biens = await Bien.query().orderBy('created_at', 'desc').orderBy('id', 'desc')

    return response.ok(biens)
  }

  /** La fiche d'un Bien : tout ce qui a été noté à son sujet (#6). */
  async show({ params, response }: HttpContext) {
    const bien = await Bien.find(params.id)

    if (!bien) {
      return response.notFound({ message: "Ce Bien n'existe pas" })
    }

    return response.ok(bien)
  }

  async store({ request, response }: HttpContext) {
    const { libelle, urlAnnonce } = await request.validateUsing(creerBienValidator)

    // `urlAnnonce` absent du corps et `urlAnnonce` vide décrivent le même
    // Bien : un Bien sans Annonce. On les ramène à `null` ici pour que la
    // colonne soit toujours écrite, et donc toujours rendue au front.
    const bien = await Bien.create({
      libelle,
      urlAnnonce: urlAnnonce ?? null,
      // Le propriétaire n'est pas saisi : il n'y a qu'un utilisateur, et
      // aucun écran ne le demandera (#4).
      proprietaireId: PROPRIETAIRE_UNIQUE,
    })

    return response.created(bien)
  }

  /**
   * La modification d'un Bien, Critère par Critère (#6).
   *
   * La mise à jour est **partielle** : seuls les champs transmis sont
   * écrits, les autres restent tels quels. C'est ce qui permet à la fiche de
   * n'envoyer que le champ modifié, et à l'assistant de n'envoyer que la
   * réponse à sa question — une question passée n'envoie rien du tout, et
   * n'efface donc rien.
   *
   * La distinction se joue sur la présence de la clé, et non sur sa valeur :
   * un champ absent n'est pas touché, un champ à `null` est vidé. Les
   * confondre reviendrait à effacer quatorze Critères à chaque réponse
   * enregistrée.
   */
  async update({ params, request, response }: HttpContext) {
    // Le Bien est cherché avant la validation : sur un Bien qui n'existe
    // pas, l'absence est ce que l'appelant doit apprendre, et non le détail
    // de ce qui clochait dans sa saisie.
    const bien = await Bien.find(params.id)

    if (!bien) {
      return response.notFound({ message: "Ce Bien n'existe pas" })
    }

    const corps = request.body()

    /**
     * Un champ que la modification ne connaît pas est refusé avant tout le
     * reste. Vine laisse passer les clés inconnues au lieu de les rejeter,
     * et sans ce garde une faute de frappe s'enverrait sans rien changer et
     * sans rien dire : l'acheteur croirait avoir saisi une valeur.
     *
     * La réponse a la forme de celles du validateur, pour que le front n'ait
     * qu'une seule sorte de refus à lire.
     */
    const inconnu = champInconnu(corps)

    if (inconnu) {
      return response.unprocessableEntity({
        errors: [
          {
            field: inconnu,
            rule: 'unknown',
            message: `« ${inconnu} » n'est pas un Critère connu`,
          },
        ],
      })
    }

    /**
     * Le corps seul, et non `request.validateUsing` : celui-ci joint les
     * paramètres de route aux données validées, donc `params` — que le
     * modèle refuserait ensuite au `merge`.
     */
    const modifications = await modifierBienValidator.validate(corps)

    // `merge` sur le seul objet validé : Vine n'y laisse que les clés
    // transmises, et les Critères absents ne sont donc jamais écrits.
    bien.merge(modifications)
    await bien.save()

    return response.ok(bien)
  }
}
