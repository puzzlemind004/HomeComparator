/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

const HealthController = () => import('#controllers/health_controller')
const BiensController = () => import('#controllers/biens_controller')

router.get('/health', [HealthController])

router.get('/biens', [BiensController, 'index'])
router.post('/biens', [BiensController, 'store'])
