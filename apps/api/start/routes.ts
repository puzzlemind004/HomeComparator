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
 * Les quatre routes qui se passent d'authentification, et la raison de
 * chacune (ADR-0011). Toute addition à cette liste est à justifier.
 *
 * La santé du service reste joignable sans session : c'est ce qu'on
 * interroge quand plus rien ne répond, connexion comprise, et c'est ce que
 * lit le healthcheck Docker. C'est la plus discutable des quatre, la seule
 * qui apprenne quelque chose à un appelant anonyme.
 */
router.get('/health', [HealthController])

// La connexion ne peut évidemment pas exiger d'être déjà connecté.
router.post('/auth/session', [AuthController, 'store'])
// L'état de session ne révèle que ce que l'appelant sait déjà.
router.get('/auth/session', [AuthController, 'show'])
// Refermer une session qu'on n'a pas est sans effet.
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
