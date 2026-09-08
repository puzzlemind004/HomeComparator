/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const HealthController = () => import('#controllers/health_controller')
const BiensController = () => import('#controllers/biens_controller')
const AuthController = () => import('#controllers/auth_controller')

/**
 * Les routes qui se passent d'authentification, et la raison de chacune.
 *
 * La connexion ne peut évidemment pas l'exiger. La santé du service doit
 * rester joignable sans session : c'est ce que la supervision et le
 * healthcheck Docker interrogent, et elle ne rend rien d'autre que
 * « le service et sa base répondent ».
 */
router.get('/health', [HealthController])

router.post('/auth/session', [AuthController, 'store'])
router.get('/auth/session', [AuthController, 'show'])
router.delete('/auth/session', [AuthController, 'destroy'])

/**
 * Tout le reste exige la session (#4). Le groupe porte le middleware plutôt
 * que chaque route : une route ajoutée au carnet est protégée du seul fait
 * d'être écrite ici, sans qu'on ait à y penser.
 */
router
  .group(() => {
    router.get('/biens', [BiensController, 'index'])
    router.post('/biens', [BiensController, 'store'])
  })
  .use(middleware.authentification())
