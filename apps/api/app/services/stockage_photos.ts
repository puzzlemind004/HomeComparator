import { randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'

/**
 * Le stockage des fichiers de photos (#13).
 *
 * Les fichiers vivent sur un volume Docker et non en base : une photo pèse
 * mille fois ce que pèse un Bien entier, et `pg_dump` n'est pas fait pour
 * transporter des mégaoctets de binaire. Le volume entre dans le périmètre
 * des sauvegardes au même titre que la base (ADR-0007).
 *
 * Ce module est le seul du carnet qui connaisse le disque. Ce qui l'appelle
 * manipule des noms de fichiers, jamais des chemins : la racine est une
 * affaire de configuration, et la faire fuir dans le contrôleur ferait de
 * chaque appelant un endroit de plus à corriger le jour où elle change.
 */

/**
 * Les types d'images acceptés, et ceux-là seuls.
 *
 * Une liste blanche et non une liste noire : ce qui n'est pas explicitement
 * une image est refusé, plutôt que de laisser passer tout ce qu'on n'a pas
 * pensé à interdire.
 *
 * HEIC en est absent alors que les iPhone le produisent par défaut. C'est
 * assumé : le navigateur ne sait pas l'afficher, et les appareils le
 * convertissent en JPEG au moment de l'envoi depuis une page web — ce qui
 * est très exactement le chemin que prend une photo ici.
 */
export const TYPES_ACCEPTES = ['jpg', 'jpeg', 'png', 'webp'] as const

/**
 * La taille maximale d'un envoi, avant redimensionnement.
 *
 * Dix mégaoctets couvrent largement la photo d'un téléphone récent, y
 * compris en pleine résolution. Ce qui est stocké pèse de toute façon bien
 * moins : cette limite ne protège pas le volume, elle protège la mémoire de
 * l'API contre un envoi qui n'a rien d'une photo de visite.
 */
export const TAILLE_MAX_MO = 10

/**
 * La largeur de la version consultable, et celle de la vignette.
 *
 * 1600px est ce qu'un écran d'ordinateur affiche en plein cadre sans qu'on
 * voie la compression ; au-delà, on transporte des pixels que personne ne
 * regarde. La vignette sert la liste et les cartes, où la photo fait
 * quelques centimètres — 400px y suffisent, et c'est ce qui rend la liste
 * consultable sur une connexion mobile (#13).
 */
const LARGEUR_CONSULTABLE = 1600
const LARGEUR_VIGNETTE = 400

/**
 * La qualité JPEG des deux versions.
 *
 * 80 est le point où l'œil ne distingue plus l'original sur une photo
 * d'intérieur, pour un tiers du poids. La vignette descend plus bas : elle
 * s'affiche trop petite pour que la différence se voie.
 */
const QUALITE_CONSULTABLE = 80
const QUALITE_VIGNETTE = 70

/** Les deux fichiers écrits pour une photo envoyée. */
export interface FichiersPhoto {
  fichier: string
  fichierVignette: string
}

/**
 * Le temporaire d'un envoi, effacé sans qu'on en tire quoi que ce soit.
 *
 * Sert le lot refusé : le bodyparser a déjà écrit chaque fichier sur le
 * disque temporaire avant que le contrôleur ne décide de les refuser, et
 * s'arrêter là les y laisserait. Un refus ne doit pas coûter plus cher au
 * stockage qu'une acceptation.
 */
export async function abandonnerTemporaire(source: string): Promise<void> {
  await effacerFichier(source)
}

/** La racine du stockage, telle que la configuration la donne. */
export function racineStockage(): string {
  return env.get('STOCKAGE_PHOTOS')
}

/** Le chemin absolu d'un fichier stocké, à partir de son seul nom. */
export function cheminPhoto(fichier: string): string {
  return join(racineStockage(), fichier)
}

/**
 * Un envoi ramené aux deux fichiers que la galerie affichera : la version
 * consultable et sa vignette.
 *
 * L'original n'est pas conservé, et c'est vrai **jusqu'au temporaire**. Le
 * bodyparser écrit chaque envoi dans `os.tmpdir()` et ne l'efface que si on
 * le lui demande : sans ce nettoyage, l'original survivrait dans la couche
 * inscriptible du conteneur — hors volume, donc hors sauvegarde, et hors de
 * tout écran. Ce serait l'orphelin que tout le reste de ce module s'emploie
 * à éviter, simplement déplacé sur un autre système de fichiers.
 *
 * Le garder ferait par ailleurs grossir le stockage d'un facteur dix pour
 * une image que personne n'ouvrirait jamais.
 *
 * Tout ressort en JPEG, quel que soit le type entré. C'est le format que
 * tout navigateur affiche, et n'en produire qu'un seul évite d'avoir à se
 * souvenir de ce qu'on a stocké pour savoir comment le servir.
 *
 * Le redimensionnement est fait **ici et non au navigateur** : le critère
 * porte sur ce qui est stocké et servi, pas sur ce qu'un écran veut bien
 * envoyer. Un appel qui ne passerait pas par la page web produirait sinon
 * des photos que la connexion mobile ne supporte pas.
 */
export async function enregistrerPhoto(source: string): Promise<FichiersPhoto | null> {
  /**
   * L'image est ouverte avant toute écriture, et un fichier que `sharp` ne
   * sait pas lire rend `null` plutôt que de lever.
   *
   * La validation de l'envoi ne suffit pas : elle reconnaît un JPEG à ses
   * premiers octets, mais un fichier tronqué, corrompu, ou d'un format que
   * `sharp` n'a pas compilé la passe sans être décodable pour autant. Sans
   * ce garde, l'acheteur recevrait un 500 nu là où il attend qu'on lui dise
   * laquelle de ses photos n'est pas passée.
   */
  try {
    await sharp(source).metadata()
  } catch {
    return null
  }

  await mkdir(racineStockage(), { recursive: true })

  /**
   * Un nom tiré au sort, et jamais celui que le téléphone a envoyé. Un nom
   * venu du client traverserait les dossiers (`../`) et se heurterait aux
   * collisions dès la deuxième photo nommée `IMG_0001.jpg` — deux
   * problèmes que ne pas lui faire confiance règle d'un coup.
   */
  const identifiant = randomUUID()
  const fichier = `${identifiant}.jpg`
  const fichierVignette = `${identifiant}.vignette.jpg`

  /**
   * `rotate()` sans argument applique l'orientation EXIF avant de
   * redimensionner. Sans lui, une photo prise en portrait — le cas courant
   * d'une visite — s'afficherait couchée : le capteur écrit l'image dans
   * son propre sens et note la rotation à côté, et la retirer des
   * métadonnées sans l'appliquer aux pixels perdrait l'information.
   *
   * `withoutEnlargement` : une petite image n'est pas étirée. L'agrandir ne
   * lui ajouterait aucun détail et lui coûterait du poids.
   */
  await sharp(source)
    .rotate()
    .resize({ width: LARGEUR_CONSULTABLE, withoutEnlargement: true })
    .jpeg({ quality: QUALITE_CONSULTABLE })
    .toFile(cheminPhoto(fichier))

  await sharp(source)
    .rotate()
    .resize({ width: LARGEUR_VIGNETTE, withoutEnlargement: true })
    .jpeg({ quality: QUALITE_VIGNETTE })
    .toFile(cheminPhoto(fichierVignette))

  /**
   * Le temporaire, une fois les deux versions tirées de lui.
   *
   * Après les écritures et non avant : c'est lui la source, et l'effacer
   * plus tôt reviendrait à redimensionner un fichier qui n'est plus là.
   *
   * L'échec est avalé — journalisé, jamais propagé. L'envoi a réussi, les
   * deux fichiers sont sur le volume, et refuser la photo pour un
   * temporaire récalcitrant ferait perdre à l'acheteur un cliché qu'il ne
   * repassera pas prendre. C'est l'inverse de l'arbitrage retenu pour la
   * suppression (ADR-0014), et pour la raison inverse : là-bas l'échec
   * laisse un orphelin sur le volume sauvegardé, ici il laisse un fichier
   * que le prochain redémarrage du conteneur emporte.
   */
  await effacerFichier(source)

  return { fichier, fichierVignette }
}

/**
 * L'effacement des fichiers d'une photo.
 *
 * **L'ordre est choisi et non subi** : les fichiers partent d'abord, la
 * ligne ensuite (#9, #13). Il n'y a ni corbeille ni restauration, et les
 * deux sens ont un coût différent — la ligne partie la première laisserait
 * un fichier que plus rien ne désigne, donc un orphelin qu'aucun écran ne
 * montre et qu'il faudrait un balayage pour retrouver. Dans l'autre sens,
 * le pire qui arrive est une ligne qui subsiste, et cette ligne est
 * précisément ce qui permet de réessayer.
 *
 * Un fichier **déjà absent est un succès** : ce qui était demandé est
 * atteint.
 *
 * Le retour dit si le volume est bien net. `false` — disque plein, volume
 * démonté — laisse à l'appelant le soin de décider, et c'est ce qui donne
 * un sens à l'ordre choisi : supprimer la ligne malgré tout produirait
 * l'orphelin que cet ordre existe pour éviter. Les deux appelants gardent
 * donc la ligne (#13).
 */
export async function effacerPhoto({ fichier, fichierVignette }: FichiersPhoto): Promise<boolean> {
  const effaces = await Promise.all([
    effacerFichier(cheminPhoto(fichier)),
    effacerFichier(cheminPhoto(fichierVignette)),
  ])

  return effaces.every(Boolean)
}

/**
 * Vrai si le fichier n'est plus là — qu'on vienne de l'effacer ou non.
 *
 * Prend un **chemin** et non un nom : il sert aussi bien les fichiers du
 * volume que le temporaire de l'envoi, qui vit ailleurs.
 */
async function effacerFichier(chemin: string): Promise<boolean> {
  try {
    await unlink(chemin)

    return true
  } catch (erreur) {
    // Déjà absent : c'est l'état visé, et il n'y a rien à signaler.
    if (erreur instanceof Error && 'code' in erreur && erreur.code === 'ENOENT') {
      return true
    }

    logger.warn({ erreur, chemin }, "Un fichier de photo n'a pas pu être effacé")

    return false
  }
}
