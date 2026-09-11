/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { fileURLToPath } from 'node:url'
import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Origines autorisées à appeler l'API, séparées par des virgules
  |----------------------------------------------------------
  */
  CORS_ORIGIN: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Mot de passe unique protégeant l'accès à l'outil
  |----------------------------------------------------------
  |
  | Un seul utilisateur ne justifie pas un système de comptes (#4) : le
  | mot de passe vit ici, et nulle part en base.
  |
  | La règle refuse la variable absente ou vide ; le `validate` y ajoute la
  | saisie d'espaces, qu'`Env.schema.string()` accepterait et qui ferait un
  | mot de passe indevinable par accident plus que par conception. Mieux
  | vaut une API qui refuse de démarrer qu'une API démarrée sans protection
  | réelle et sans le dire.
  |
  */
  /*
  |----------------------------------------------------------
  | Racine du stockage des photos
  |----------------------------------------------------------
  |
  | Les fichiers de photos vivent sur un volume Docker et non en base (#13) :
  | `pg_dump` n'est pas fait pour transporter des mégaoctets de binaire. Ce
  | chemin est le point de montage de ce volume, et il entre dans le
  | périmètre des sauvegardes au même titre que la base (ADR-0007).
  |
  | Une valeur par défaut plutôt qu'une variable obligatoire : contrairement
  | au mot de passe, une racine oubliée ne laisse rien d'ouvert — elle écrit
  | à côté, ce que le volume de `docker-compose.yml` corrige en le montant
  | précisément là. Le défaut est résolu ici et non chez l'appelant, pour que
  | le stockage lise un chemin et jamais un `undefined` à rattraper.
  |
  */
  STOCKAGE_PHOTOS: (_cle: string, valeur?: string) =>
    valeur && valeur.trim() !== ''
      ? valeur
      : fileURLToPath(new URL('../stockage/photos', import.meta.url)),

  /*
  |----------------------------------------------------------
  | Version déployée, et horodatage de la dernière sauvegarde
  |----------------------------------------------------------
  |
  | Les deux renseignements que la route de santé ajoute à un appelant muni
  | d'une session (#67). Ni l'un ni l'autre n'est requis : le carnet tourne
  | sans, et refuser de démarrer faute de version arrêterait le
  | développement pour un numéro qui n'a de sens qu'en production.
  |
  | `APP_VERSION` parvient à l'image par un argument de construction, que le
  | `Dockerfile` fige en variable d'environnement : elle désigne l'image et
  | non l'exécution, et une image qui pourrait se voir attribuer une autre
  | version au démarrage ne dirait plus ce qu'elle contient. Hors conteneur,
  | il n'y a rien à désigner, d'où le `dev` par défaut.
  |
  | `HORODATAGE_SAUVEGARDE` est le fichier que la sauvegarde quotidienne
  | dépose sur le volume et que l'API lit (ADR-0007). Le défaut est résolu
  | ici et non chez l'appelant, pour que le service lise un chemin et jamais
  | un `undefined` à rattraper.
  |
  */
  APP_VERSION: (_cle: string, valeur?: string) =>
    valeur && valeur.trim() !== '' ? valeur.trim() : 'dev',

  HORODATAGE_SAUVEGARDE: (_cle: string, valeur?: string) =>
    valeur && valeur.trim() !== ''
      ? valeur
      : fileURLToPath(new URL('../stockage/derniere-sauvegarde', import.meta.url)),

  APP_PASSWORD: (cle: string, valeur?: string) => {
    if (!valeur || valeur.trim() === '') {
      throw new Error(`La variable ${cle} est obligatoire et ne peut pas être vide`)
    }

    return valeur
  },
})
