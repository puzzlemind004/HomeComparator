import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { estAuthentifie } from '#services/session_authentification'

/**
 * Refuse tout appel dont la session n'atteste pas du mot de passe unique (#4).
 *
 * Il s'applique par défaut à toutes les routes, celles qui s'en dispensent
 * le déclarant explicitement (`start/routes.ts`) : l'oubli fait alors une
 * route protégée de trop, jamais une route ouverte par mégarde.
 */
export default class AuthentificationMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if (!estAuthentifie(ctx)) {
      // 401 et non 403 : la session n'est pas insuffisante, elle est
      // absente. C'est ce que le front lit pour renvoyer vers la connexion.
      return ctx.response.unauthorized({ message: 'Authentification requise' })
    }

    return next()
  }
}
