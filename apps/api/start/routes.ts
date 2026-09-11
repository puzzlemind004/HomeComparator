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
const PhotosController = () => import('#controllers/photos_controller')

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
    router.get('/biens/:id', [BiensController, 'show'])
    // `PATCH` et non `PUT` : la fiche et l'assistant n'envoient que le
    // Critère modifié, et le reste du Bien n'a pas à transiter pour rester
    // en place (#6).
    router.patch('/biens/:id', [BiensController, 'update'])
    // La suppression définitive, que la confirmation de l'écran précède
    // (#9). Elle ne se distingue de la modification que par son verbe :
    // c'est le même Bien, désigné de la même façon.
    router.delete('/biens/:id', [BiensController, 'destroy'])

    /**
     * Les photos d'un Bien (#13). Elles sont dans le groupe authentifié
     * comme le reste : les fichiers eux-mêmes sont servis par `show`, et
     * non par nginx en statique, précisément pour qu'ils soient derrière
     * la session (ADR-0011). Un dossier exposé en statique le serait pour
     * qui en devine le nom.
     */
    router.get('/biens/:bienId/photos', [PhotosController, 'index'])
    // Le pluriel jusque dans le corps : on ajoute une série, pas une photo
    // à la fois, parce que c'est ainsi qu'on photographie une visite.
    router.post('/biens/:bienId/photos', [PhotosController, 'store'])
    router.get('/biens/:bienId/photos/:id', [PhotosController, 'show'])
    router.delete('/biens/:bienId/photos/:id', [PhotosController, 'destroy'])
  })
  .use(middleware.authentification())

/**
 * L'identifiant d'un Bien est un entier, et une adresse qui n'en porte pas
 * ne désigne aucun Bien : elle doit rendre le 404 des Biens absents.
 *
 * Sans cette contrainte, `/biens/abc` atteint la requête SQL, où PostgreSQL
 * refuse la conversion — une erreur 500 qui porte le texte de la requête
 * dans sa réponse. C'est le mauvais code, et c'est en dire trop.
 *
 * Déclaré globalement plutôt que route par route : tout `:id` du carnet
 * désigne un Bien, et une route ajoutée en hérite sans qu'on y pense.
 */
router.where('id', router.matchers.number())

/**
 * `:bienId` désigne un Bien au même titre que `:id`, et suit donc la même
 * règle : une adresse qui n'en porte pas un ne désigne aucun Bien, et rend
 * le 404 des Biens absents plutôt que le 500 de PostgreSQL.
 */
router.where('bienId', router.matchers.number())
