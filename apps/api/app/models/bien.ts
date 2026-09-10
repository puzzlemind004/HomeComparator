import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { Statut } from '#services/statut'

/**
 * Un décimal rendu par `pg`, ramené au nombre que le JSON doit porter — ou
 * `null` quand il n'y a pas de nombre à en tirer.
 *
 * `Number()` seul ne suffirait pas : `Number('')` vaut `0`, et c'est
 * précisément la confusion que tout le reste s'emploie à éviter — un Critère
 * non renseigné qui passerait pour un Critère à zéro, donc pour le plus petit
 * de tous sur un tri par prix. `Number('abc')` rend `NaN`, qui s'écrirait
 * « NaN » à l'écran.
 */
function versNombreOuNull(valeur: string | number | null): number | null {
  if (valeur === null || valeur === undefined || valeur === '') {
    return null
  }

  const nombre = Number(valeur)

  return Number.isFinite(nombre) ? nombre : null
}

/**
 * Un logement que l'acheteur envisage d'acheter : l'objet que l'on compare.
 *
 * Chaque Critère à venir ajoutera sa propre colonne (ADR-0004), donc son
 * propre champ ici. Seul le Libellé est obligatoire (ADR-0008).
 */
export default class Bien extends BaseModel {
  static table = 'biens'

  @column({ isPrimary: true })
  declare id: number

  /** Le nom sous lequel le Bien apparaît dans les listes, saisi à la main. */
  @column()
  declare libelle: string

  /**
   * L'URL de l'Annonce par laquelle le Bien a été repéré. Vide tant qu'elle
   * n'a pas été renseignée — une Annonce peut d'ailleurs disparaître alors
   * que le Bien reste pertinent.
   */
  @column()
  declare urlAnnonce: string | null

  /**
   * Le propriétaire du Bien, rempli à la création avec une valeur constante
   * (#4). L'outil n'a qu'un utilisateur et n'offre aucune gestion de
   * comptes ; cette colonne n'existe que pour qu'un éventuel passage au
   * multi-utilisateurs n'ait pas à rattacher après coup des Biens existants.
   */
  @column()
  declare proprietaireId: string

  /**
   * Les Notes : le texte libre attaché au Bien, pour tout ce qui compte mais
   * ne se compare pas en colonne — impressions de visite, défauts constatés,
   * travaux à prévoir, remarques sur le voisinage (#8).
   *
   * Un champ propre du Bien, ni Critère ni champ lié au Statut, et c'est
   * pourquoi il est déclaré ici plutôt qu'avec les uns ou les autres
   * (ADR-0012).
   *
   * `null` veut dire « rien d'écrit », et la chaîne vide n'est jamais
   * stockée : c'est ce que le validateur en fait, comme pour l'URL de
   * l'Annonce. Les sauts de ligne, eux, sont conservés tels quels — une liste
   * de travaux se lit en lignes.
   */
  @column()
  declare notes: string | null

  /**
   * Les Critères, un champ par colonne (ADR-0004). Tous facultatifs : la
   * création ne demande qu'un Libellé (ADR-0008) et la complétion arrive
   * plus tard, au téléphone ou pendant la visite.
   *
   * `null` veut dire « pas encore renseigné », et jamais « zéro » : c'est
   * cette distinction que le tableau (#10) et la comparaison (#12) lisent
   * pour ne pas désigner un Critère absent comme la meilleure valeur.
   *
   * L'ordre, les libellés affichés et les valeurs admises par les
   * énumérations ne sont pas ici : ils vivent dans la définition
   * centralisée, côté front, que les écrans lisent (ADR-0004, ADR-0010).
   */

  /** Le prix affiché par l'annonce, en euros. */
  @column()
  declare prixDemande: number | null

  /**
   * La surface habitable en m². `pg` rend les décimaux sous forme de chaîne
   * pour ne pas perdre de précision ; on les ramène au nombre que le JSON
   * doit porter, faute de quoi le front recevrait `"72.50"` là où il attend
   * une valeur à comparer.
   */
  @column({
    consume: (valeur: string | number | null) => versNombreOuNull(valeur),
  })
  declare surfaceHabitable: number | null

  @column()
  declare nombrePieces: number | null

  /** L'adresse, souvent inconnue au repérage : les annonces la taisent. */
  @column()
  declare adresse: string | null

  /** La ville ou le quartier, ce que l'annonce donne quand elle tait l'adresse. */
  @column()
  declare villeQuartier: string | null

  /** La taxe foncière, en euros par an. */
  @column()
  declare taxeFonciere: number | null

  /** Les charges de copropriété, en euros par mois. */
  @column()
  declare chargesCopropriete: number | null

  /** Le nombre de véhicules que le Bien permet de garer. */
  @column()
  declare capaciteStationnement: number | null

  /** Le temps de trajet jusqu'au lieu de travail, en minutes (ADR-0009). */
  @column()
  declare tempsTrajetTravail: number | null

  /** La classe énergétique, de A à G. */
  @column()
  declare dpe: string | null

  @column()
  declare typeChauffage: string | null

  @column()
  declare anneeConstruction: number | null

  @column()
  declare typeBien: string | null

  /** Ce dont le Bien dispose à l'extérieur : rien, balcon, terrasse, jardin. */
  @column()
  declare exterieur: string | null

  /** L'ampleur des travaux à prévoir, telle que l'acheteur l'estime. */
  @column()
  declare travauxAPrevoir: string | null

  /**
   * L'étape où se trouve le Bien dans la recherche (#7).
   *
   * Ce n'est pas un Critère : il ne se compare pas d'un Bien à l'autre, il
   * décide de ce qui est pertinent. C'est lui qui commande les deux champs
   * qui suivent (ADR-0002).
   *
   * Aucune transition n'est interdite, et l'API n'en connaît donc aucune :
   * il n'y a rien à vérifier au-delà de ce que le validateur accepte comme
   * Statut. Un outil personnel n'a pas à empêcher son unique utilisateur de
   * corriger un état.
   */
  @column()
  declare statut: Statut

  /**
   * Les champs liés au Statut, qui n'existent qu'à partir d'une étape du
   * cycle (ADR-0002).
   *
   * Ils ne sont jamais effacés en reculant dans le cycle : perdre une date
   * de visite sur un mauvais clic coûterait plus cher que d'afficher une
   * donnée hors-contexte. C'est l'écran qui choisit de ne pas la montrer,
   * pas la base de l'oublier.
   */

  /**
   * La date de la visite, à partir de « À visiter ». Elle reste vide tant
   * que le rendez-vous n'est pas fixé : c'est le cas ordinaire du Bien qu'on
   * vient de contacter.
   *
   * `@column.date` et non `dateTime` : c'est un jour, sans heure, et le
   * sérialiser en `YYYY-MM-DD` évite qu'un décalage de fuseau ne fasse
   * afficher la veille au navigateur.
   */
  @column.date()
  declare dateVisite: DateTime | null

  /**
   * Le montant de la dernière offre, en euros, à partir de « Offre faite ».
   *
   * « La dernière » et non « les offres » : une négociation se suit par son
   * état courant, et l'historique des montants successifs se raconte dans
   * les Notes plutôt qu'en table à part.
   */
  @column()
  declare montantDerniereOffre: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * Les colonnes que la liste rapatrie : toutes, sauf les Notes (#8).
   *
   * La liste n'affiche pas les Notes et n'a aucune raison de les faire
   * voyager — un seul Bien bien rempli pèse plus lourd à lui seul que tout
   * le reste de la liste réunie, et rien à l'écran n'en montre un caractère.
   * La fiche, elle, les demande par `show`, où elles sont précisément ce
   * qu'on vient lire.
   *
   * La liste est **dérivée des colonnes déclarées** plutôt qu'écrite à la
   * main : un Critère ajouté au modèle entre dans la liste du seul fait
   * d'exister, sans quoi il faudrait penser à l'ajouter ici — un geste de
   * plus à chaque Critère, ce qu'ADR-0004 s'emploie justement à éviter.
   */
  static colonnesDeListe(): string[] {
    return [...this.$columnsDefinitions.values()]
      .map(({ columnName }) => columnName)
      .filter((colonne) => colonne !== 'notes')
  }
}
