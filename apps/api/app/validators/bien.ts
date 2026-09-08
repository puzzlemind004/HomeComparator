import vine, { SimpleMessagesProvider } from '@vinejs/vine'

/**
 * Un Bien se crée avec son seul Libellé (ADR-0008). L'URL de l'Annonce est
 * la seule autre donnée acceptée ici ; les Critères viendront ensuite, par
 * la complétion, chacun avec sa propre colonne (ADR-0004).
 */
export const creerBienValidator = vine.compile(
  vine.object({
    // `trim` avant `minLength` : une saisie d'espaces ne fait pas un Libellé,
    // elle ne sert pas la reconnaissance qui est la raison d'être du champ.
    libelle: vine.string().trim().minLength(1).maxLength(255),

    /**
     * Un champ laissé vide vaut « pas d'Annonce » — donc `null` en base, et
     * non une erreur de saisie.
     *
     * Le corps de requête est déjà passé par `convertEmptyStringsToNull`
     * (`config/bodyparser.ts`), qui traite la chaîne vide. `parse` couvre ce
     * qui lui échappe : une saisie d'espaces, que le formulaire produit tout
     * aussi facilement. Il s'exécute avant les règles, donc `url` ne voit
     * jamais la chaîne vide qu'elle rejetterait.
     */
    urlAnnonce: vine
      .string()
      .parse((valeur) => (typeof valeur === 'string' && valeur.trim() === '' ? null : valeur))
      .trim()
      // `maxLength` avant `url` : au-delà de la borne, c'est la longueur
      // qu'il faut annoncer, et non une adresse invalide.
      .maxLength(2048)
      /**
       * `require_protocol` est faux par défaut chez Vine, ce qui laisserait
       * passer `www.portail.test/annonce` — la forme exacte d'un copier-coller
       * depuis la barre d'adresse. Sans schéma, le `href` du lien devient un
       * chemin relatif, et « Voir l'Annonce » renvoie vers l'application.
       * Seuls http et https ont un sens pour une Annonce en ligne.
       */
      .url({ protocols: ['http', 'https'], require_protocol: true })
      .nullable()
      .optional(),
  })
)

/**
 * Les messages sont rédigés pour être lus tels quels par l'acheteur : ils
 * remontent jusqu'au formulaire sans traduction intermédiaire.
 */
creerBienValidator.messagesProvider = new SimpleMessagesProvider({
  'libelle.required': 'Le Libellé est obligatoire',
  'libelle.minLength': 'Le Libellé est obligatoire',
  // Une saisie qui n'est pas du texte ne vient pas du formulaire, mais le
  // message part quand même vers une interface : il se lit comme les autres.
  'libelle.string': 'Le Libellé est obligatoire',
  'libelle.maxLength': 'Le Libellé ne doit pas dépasser 255 caractères',
  'urlAnnonce.string': "L'URL de l'Annonce n'est pas une adresse valide",
  'urlAnnonce.url': "L'URL de l'Annonce n'est pas une adresse valide",
  'urlAnnonce.maxLength': "L'URL de l'Annonce ne doit pas dépasser 2048 caractères",
})
