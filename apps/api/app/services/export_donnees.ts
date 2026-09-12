import type Bien from '#models/bien'
import type Photo from '#models/photo'

/**
 * L'export des données du carnet : ce qu'il porte, et comment il s'écrit
 * (#14).
 *
 * Tout est saisi à la main (ADR-0001), et trois mois de recherche perdus
 * videraient le carnet de son intérêt. L'export sert deux choses à la fois :
 * manipuler ses Biens dans un tableur, et ne pas se sentir prisonnier de
 * l'outil (ADR-0007). Ce sont deux usages différents, d'où deux formats.
 *
 * Ce module ne connaît ni HTTP ni base : il reçoit des Biens et rend du
 * texte. C'est ce qui permet de décrire le format — l'échappement, le
 * séparateur, le BOM — sans monter de serveur, et au contrôleur de ne
 * s'occuper que de la réponse.
 *
 * **Les libellés des Critères ne sont pas ici.** Ils vivent dans la
 * définition centralisée, côté front (ADR-0004, ADR-0010), et les recopier
 * en ferait une seconde source à tenir d'accord — celle-là même qu'ADR-0004
 * s'emploie à éviter. Les en-têtes du CSV sont donc les identifiants que
 * l'API échange : `prixDemande` et non « Prix demandé ». C'est moins beau
 * dans un tableur, et c'est le prix d'un export qui ne ment jamais sur ce
 * qu'il contient.
 */

/** Les deux formats proposés (#14). */
export const FORMATS_EXPORT = ['json', 'csv'] as const

export type FormatExport = (typeof FORMATS_EXPORT)[number]

/**
 * Le format par défaut : le JSON, qui porte tout — les Photos par leurs
 * noms, les Notes avec leurs sauts de ligne. Le CSV est la vue tableur du
 * même carnet, et perd forcément un peu en chemin.
 */
export const FORMAT_PAR_DEFAUT: FormatExport = 'json'

/**
 * Le format demandé, ou le défaut.
 *
 * Un format inconnu est **ignoré** plutôt que refusé, comme l'est un Statut
 * inconnu au filtre de la liste (#7) : c'est un paramètre d'affichage et non
 * une saisie. Le refuser laisserait l'acheteur sans export pour une adresse
 * mal recopiée, là où rendre le format complet est exactement ce que
 * l'export fait sans paramètre.
 */
export function formatDemande(valeur: unknown): FormatExport {
  return FORMATS_EXPORT.find((connu) => connu === valeur) ?? FORMAT_PAR_DEFAUT
}

/**
 * Une Photo telle que l'export la porte : son nom de fichier et son rang,
 * jamais ses octets (ADR-0014).
 *
 * Les fichiers vivent sur le volume, qui entre dans le périmètre de la
 * sauvegarde au même titre que la base (ADR-0007). Un export qui les
 * embarquerait cesserait d'être le fichier léger qu'on ouvre dans un
 * tableur — une seule photo pèse mille fois ce que pèse un Bien entier.
 */
interface PhotoExportee {
  fichier: string
  fichierVignette: string
  rang: number
}

/** Un Bien tel que l'export le porte : tout ce qui a été saisi. */
interface BienExporte {
  [champ: string]: unknown
  photos: PhotoExportee[]
}

/** L'export complet, tel que le JSON le rend. */
export interface ExportCarnet {
  /**
   * Quand l'export a été produit.
   *
   * Un fichier retrouvé six mois plus tard dans un dossier de
   * téléchargements ne dit rien de ce qu'il contient : cette date est ce qui
   * permet de savoir si on tient la dernière version de son carnet ou une
   * copie d'avant la dernière visite.
   */
  exporteLe: string
  biens: BienExporte[]
}

/**
 * Les champs que l'export **ne porte pas**, et la raison de chacun.
 *
 * `proprietaireId` : la même valeur constante sur tous les Biens, l'outil
 * n'ayant qu'un utilisateur (#4). Une colonne identique partout n'apprend
 * rien à un tableur et n'aiderait aucune relecture.
 *
 * `id` est **gardé**, lui, et ce n'est pas une inconséquence : c'est ce qui
 * permet de rapprocher une ligne de tableur du Bien dont elle vient, et de
 * recoller un export à un autre.
 */
const CHAMPS_ECARTES = new Set(['proprietaireId'])

/**
 * Les champs d'un Bien tels que l'export les ordonne, dérivés des colonnes
 * déclarées au modèle.
 *
 * Dérivés plutôt qu'énumérés : un Critère ajouté au modèle entre dans
 * l'export du seul fait d'exister (ADR-0004), sans quoi il faudrait penser
 * à l'ajouter ici — le geste de plus que la définition centralisée existe
 * pour supprimer. C'est le même raisonnement que `colonnesDeListe`.
 *
 * L'ordre est celui de la déclaration au modèle, donc celui des migrations
 * successives. Il n'est pas celui des groupes de l'écran — cet ordre-là est
 * une affaire de présentation, et vit côté front avec les libellés.
 */
function champsExportes(bien: Bien): string[] {
  const modele = bien.constructor as typeof Bien

  return [...modele.$columnsDefinitions.keys()].filter((champ) => !CHAMPS_ECARTES.has(champ))
}

/**
 * Un Bien réduit à ce que l'export en dit.
 *
 * Les valeurs passent par la sérialisation de Lucid plutôt que par les
 * propriétés brutes : c'est elle qui rend la date de visite en
 * `YYYY-MM-DD` plutôt qu'en objet Luxon, et les décimaux en nombres. Un
 * export qui lirait le modèle directement écrirait des objets là où le JSON
 * attend des valeurs.
 */
function bienExporte(bien: Bien, photos: Photo[]): BienExporte {
  const serialise = bien.serialize() as Record<string, unknown>
  const champs: Record<string, unknown> = {}

  for (const champ of champsExportes(bien)) {
    /**
     * `?? null` et non la valeur telle quelle : un champ que Lucid n'a pas
     * chargé arriverait `undefined`, qui disparaît à la sérialisation JSON.
     * L'acheteur lirait alors une clé absente là où le carnet dit « pas
     * encore renseigné » — la distinction sur laquelle tout repose (#6).
     */
    champs[champ] = serialise[champ] ?? null
  }

  /**
   * Les Photos **après** les champs du Bien, et non avant : un export se
   * lit, et l'identifiant puis le Libellé sont ce par quoi on reconnaît la
   * ligne. Les ouvrir sur une galerie repousserait le nom du Bien vingt
   * clés plus bas.
   */
  return { ...champs, photos: photos.map(photoExportee) }
}

function photoExportee(photo: Photo): PhotoExportee {
  return {
    fichier: photo.fichier,
    fichierVignette: photo.fichierVignette,
    rang: photo.rang,
  }
}

/**
 * L'export complet, dans l'ordre de la liste : du plus récemment repéré au
 * plus ancien.
 *
 * L'ordre est celui de l'écran et non celui où PostgreSQL retrouve ses
 * lignes : sans tri explicite, deux exports successifs ne se compareraient
 * plus d'un jour à l'autre.
 */
export function exporterCarnet(
  biens: Bien[],
  photosParBien: Map<number, Photo[]>,
  exporteLe: string
): ExportCarnet {
  return {
    exporteLe,
    biens: biens.map((bien) => bienExporte(bien, photosParBien.get(bien.id) ?? [])),
  }
}

/**
 * Le séparateur du CSV : le point-virgule, et non la virgule.
 *
 * C'est ce qu'attend un tableur configuré en français — Excel lit le
 * séparateur de listes de la locale —, et le carnet est tenu en français.
 * Un CSV à la virgule y arriverait sur une seule colonne, ce que l'acheteur
 * lirait comme un export cassé plutôt que comme un réglage à changer.
 */
const SEPARATEUR = ';'

/**
 * Les caractères qui, en tête d'une valeur, font lire la suite comme une
 * formule par un tableur.
 *
 * `=` et `+` ouvrent une formule ; `-` aussi, un tableur lisant `-A1` comme
 * une soustraction ; `@` ouvre un appel de fonction hérité de Lotus, que
 * Excel accepte encore.
 */
const DEBUTS_DE_FORMULE = new Set(['=', '+', '-', '@'])

/**
 * Ce qui ressemble à un nombre, et doit donc rester un nombre.
 *
 * C'est ce qui distingue un montant négatif — `-15000`, que le tableur doit
 * pouvoir additionner — d'une valeur qui commence par un tiret sans être un
 * nombre. Sans cette exception, la neutralisation ferait du texte de toutes
 * les offres négatives.
 */
const NOMBRE = /^[+-]?\d+(?:[.,]\d+)?$/

/**
 * Le BOM UTF-8, sans lequel Excel lit le fichier dans sa page de codes
 * locale : « Libellé » y devient « LibellÃ© ».
 *
 * C'est le défaut le plus visible d'un export ouvert par quelqu'un qui n'a
 * rien à régler, et l'AC de #14 le nomme : « le CSV s'ouvre correctement
 * dans un tableur, accents et séparateurs compris ».
 */
const BOM = '﻿'

/**
 * La colonne que le CSV ajoute, et que le JSON n'a pas : le nombre de
 * Photos.
 *
 * Le tableur sert à comparer des Biens, et une colonne de noms de fichiers
 * tirés au sort n'y compare rien — alors que « ce Bien-là, j'en ai douze
 * photos » se lit d'un coup d'œil. Les noms restent dans le JSON, qui est le
 * format complet.
 */
const COLONNE_PHOTOS = 'nombrePhotos'

/**
 * Le carnet en CSV : une ligne d'en-têtes, puis une ligne par Bien.
 *
 * Le CSV est construit depuis l'export JSON plutôt que depuis les Biens :
 * les deux formats portent alors les mêmes valeurs par construction, et un
 * Critère ajouté entre dans les deux d'un seul geste.
 */
export function versCsv({ biens }: ExportCarnet, champs: string[]): string {
  const colonnes = [...champs, COLONNE_PHOTOS]

  const lignes = [
    colonnes.join(SEPARATEUR),
    ...biens.map((bien) =>
      colonnes
        .map((colonne) => echapper(colonne === COLONNE_PHOTOS ? bien.photos.length : bien[colonne]))
        .join(SEPARATEUR)
    ),
  ]

  /**
   * `\r\n` en fin de ligne, ce que RFC 4180 prescrit et ce qu'attendent les
   * tableurs sous Windows. Les lecteurs qui n'en ont pas besoin l'ignorent ;
   * l'inverse n'est pas vrai.
   */
  return BOM + lignes.join('\r\n') + '\r\n'
}

/**
 * Les en-têtes du CSV, dérivés du premier Bien exporté.
 *
 * Un carnet vide n'a aucun Bien d'où les tirer, et n'en rend donc aucun :
 * le fichier se réduit alors à la seule colonne que `versCsv` ajoute de
 * lui-même, `nombrePhotos`. Les colonnes sont celles du modèle, et il n'y a
 * rien à en dire quand il n'y a rien à exporter — inventer la ligne
 * complète ferait promettre des Critères que le fichier ne porte pas.
 */
export function champsDuCsv({ biens }: ExportCarnet): string[] {
  const [premier] = biens

  return premier ? Object.keys(premier).filter((champ) => champ !== 'photos') : []
}

/**
 * Une valeur telle que le CSV la porte.
 *
 * Trois cas, et chacun compte :
 *
 * - **`null` sort vide**, et jamais « null ». Une cellule vide se lit dans
 *   un tableur comme une donnée absente, là où le mot s'y lirait comme du
 *   texte saisi — et le carnet repose entièrement sur la distinction entre
 *   « pas renseigné » et une valeur (#6).
 * - **Une valeur qui porte le séparateur, un guillemet ou un saut de ligne
 *   est encadrée**, et ses guillemets doublés. Sans cela, un point-virgule
 *   dans les Notes fabriquerait une colonne, et un guillemet refermerait le
 *   champ en décalant tout le reste de la ligne. Les Notes sont du texte
 *   libre, et la ponctuation y est ordinaire.
 * - **Les sauts de ligne sont conservés dans la cellule**, jamais aplatis :
 *   une liste de travaux se lit en lignes (ADR-0012), et c'est encadré que
 *   le format les porte.
 *
 * Et un quatrième, qui n'est pas une affaire de format mais de ce que le
 * tableur fait du fichier : **une valeur qui commence par un caractère de
 * formule est neutralisée** (voir `neutraliserFormule`).
 */
function echapper(valeur: unknown): string {
  if (valeur === null || valeur === undefined) {
    return ''
  }

  const texte = neutraliserFormule(String(valeur))

  /**
   * Le séparateur est repris de la constante plutôt que réécrit : les deux
   * doivent s'accorder, et une virgule choisie plus haut sans être changée
   * ici ferait un échappement qui ne protège plus rien — en silence.
   */
  const aEncadrer = new RegExp(`["\r\n${SEPARATEUR}]`)

  return aEncadrer.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte
}

/**
 * Une valeur que le tableur n'évaluera pas comme une formule.
 *
 * `=`, `+`, `-` et `@` en tête ouvrent une formule, et le tableur l'évalue à
 * l'ouverture. Deux conséquences, et l'une comme l'autre est inacceptable
 * pour un carnet qu'on exporte précisément pour le conserver : la donnée
 * disparaît de l'écran au profit d'un `#NAME?`, et un contenu bien choisi
 * peut faire proposer une exécution. Le texte des Notes est recopié
 * d'annonces, pas saisi sous contrainte — le validateur n'impose rien sur le
 * premier caractère (`validators/bien.ts`).
 *
 * **Encadrer ne suffit pas** : `"=1+1"` s'évalue tout autant. C'est
 * l'apostrophe en tête qui fait lire la suite comme du texte, et elle ne
 * s'affiche pas dans la cellule.
 *
 * Un nombre en est exempté : `-15000` est un montant que le tableur doit
 * pouvoir additionner, et une apostrophe en ferait du texte. C'est la limite
 * assumée du geste — ce qui ressemble à un nombre passe tel quel.
 */
function neutraliserFormule(texte: string): string {
  const premier = texte[0]

  if (premier === undefined || !DEBUTS_DE_FORMULE.has(premier) || NOMBRE.test(texte)) {
    return texte
  }

  return `'${texte}`
}

/**
 * Le nom sous lequel l'export se télécharge.
 *
 * Daté, parce qu'un `export.csv` de plus dans un dossier de téléchargements
 * ne dit pas de quel jour il date — et que l'acheteur qui exporte chaque
 * semaine en aura plusieurs côte à côte.
 */
export function nomDuFichier(format: FormatExport, jour: string): string {
  return `homecomparator-${jour}.${format}`
}
