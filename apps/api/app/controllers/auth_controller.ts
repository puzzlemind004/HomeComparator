import type { HttpContext } from '@adonisjs/core/http'
import {
  estAuthentifie,
  fermerSession,
  motDePasseValide,
  ouvrirSession,
} from '#services/session_authentification'
import {
  tentativeAutorisee,
  tentativeEchouee,
  tentativeReussie,
} from '#services/limitation_connexion'
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
   *
   * Le quota de tentatives (#26) rejoint cette liste plutôt que d'y faire
   * exception : la tentative bloquée rend elle aussi ce refus-là, sans 429
   * ni `Retry-After`. Un écart apprendrait à l'attaquant qu'il a été
   * repéré, ce qui est très exactement ce que le message unique refuse de
   * lui dire. Le prix en est assumé : le propriétaire légitime qui s'est
   * trompé dix fois attend la fenêtre sans que l'écran lui dise pourquoi.
   */
  async store(ctx: HttpContext) {
    const { request, response } = ctx

    // Au-delà du quota, on sort avant la comparaison : le mot de passe
    // proposé n'est pas même regardé, et le refus ne coûte qu'une lecture.
    if (!(await tentativeAutorisee(ctx))) {
      return response.unauthorized({ message: MOT_DE_PASSE_REFUSE })
    }

    const motDePasse = request.input('motDePasse')

    if (typeof motDePasse !== 'string' || !motDePasseValide(motDePasse)) {
      await tentativeEchouee(ctx)

      return response.unauthorized({ message: MOT_DE_PASSE_REFUSE })
    }

    await tentativeReussie(ctx)
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
