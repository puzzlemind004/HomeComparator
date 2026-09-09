import type { HttpContext } from '@adonisjs/core/http'
import {
  estAuthentifie,
  fermerSession,
  motDePasseValide,
  ouvrirSession,
} from '#services/session_authentification'
import { MOT_DE_PASSE_REFUSE } from '#validators/authentification'

/**
 * L'accès à l'outil : donner le mot de passe unique, savoir si la session
 * vaut encore, et la refermer (#4).
 *
 * Aucune inscription, aucune réinitialisation, aucun fournisseur externe :
 * un seul utilisateur ne justifie pas un système de comptes.
 */
export default class AuthController {
  /**
   * Ouvre une session sur présentation du mot de passe.
   *
   * Tout refus rend la même réponse — même statut, même message — quelle que
   * soit sa cause : mot de passe faux, champ vide, corps de requête absent
   * ou d'un autre type. Distinguer ces cas apprendrait à qui essaie des mots
   * de passe ce qui n'a pas convenu dans sa tentative.
   */
  async store(ctx: HttpContext) {
    const { request, response } = ctx
    const motDePasse = request.input('motDePasse')

    if (typeof motDePasse !== 'string' || !motDePasseValide(motDePasse)) {
      return response.unauthorized({ message: MOT_DE_PASSE_REFUSE })
    }

    ouvrirSession(ctx)

    return response.ok({ authentifie: true })
  }

  /**
   * L'état de la session, pour que le front sache s'il doit afficher la
   * connexion sans avoir à provoquer un 401 sur une route protégée.
   *
   * Toujours 200, y compris sans session : c'est une question, pas un accès.
   */
  async show(ctx: HttpContext) {
    return ctx.response.ok({ authentifie: estAuthentifie(ctx) })
  }

  /** Referme la session. Sans session ouverte, il n'y a rien à faire, et
   * répondre autrement qu'en succès n'apporterait rien à l'appelant. */
  async destroy(ctx: HttpContext) {
    fermerSession(ctx)

    return ctx.response.ok({ authentifie: false })
  }
}
