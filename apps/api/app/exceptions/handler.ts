import app from '@adonisjs/core/services/app'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import type { HttpError } from '@adonisjs/core/types/http'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * Status pages are used to display a custom HTML pages for certain error
   * codes. You might want to enable them in production only, but feel
   * free to enable them in development as well.
   */
  protected renderStatusPages = app.inProduction

  /**
   * Cette API ne sert qu'un front qui parle JSON : ses erreurs doivent être
   * lisibles par le même code que ses réponses.
   *
   * Par défaut, AdonisJS négocie le format d'après l'en-tête `Accept` et
   * bascule sur du HTML quand le client n'en envoie pas — une erreur de
   * validation arriverait alors au front sous une forme qu'il ne sait pas
   * lire. On court-circuite la négociation dans les deux sens.
   */
  renderError(error: HttpError, ctx: HttpContext) {
    return this.renderErrorAsJSON(error, ctx)
  }

  renderValidationError(error: HttpError, ctx: HttpContext) {
    return this.renderValidationErrorAsJSON(error, ctx)
  }

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
