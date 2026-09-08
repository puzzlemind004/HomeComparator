import type { HttpContext } from '@adonisjs/core/http'
import Bien from '#models/bien'
import { creerBienValidator } from '#validators/bien'

/**
 * Les Biens : les créer avec leur seul Libellé, et les retrouver dans une
 * liste. C'est la boucle de repérage, celle qui doit tenir en quelques
 * secondes le soir devant une annonce (ADR-0008).
 */
export default class BiensController {
  /** Tous les Biens enregistrés, du plus récemment repéré au plus ancien. */
  async index({ response }: HttpContext) {
    const biens = await Bien.query().orderBy('created_at', 'desc').orderBy('id', 'desc')

    return response.ok(biens)
  }

  async store({ request, response }: HttpContext) {
    const { libelle, urlAnnonce } = await request.validateUsing(creerBienValidator)

    // `urlAnnonce` absent du corps et `urlAnnonce` vide décrivent le même
    // Bien : un Bien sans Annonce. On les ramène à `null` ici pour que la
    // colonne soit toujours écrite, et donc toujours rendue au front.
    const bien = await Bien.create({ libelle, urlAnnonce: urlAnnonce ?? null })

    return response.created(bien)
  }
}
