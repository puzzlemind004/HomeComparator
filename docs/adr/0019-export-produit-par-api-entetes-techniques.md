# L'export est produit par l'API, et ses en-têtes CSV sont des identifiants

L'export du carnet (#14) est la moitié « à la demande » du dispositif qu'ADR-0007 décrit, l'autre étant le `pg_dump` quotidien de la pile (#71). Il sert deux choses à la fois : manipuler ses Biens dans un tableur, et ne pas se sentir prisonnier de l'outil.

## Le fichier est écrit par l'API, pas par le front

Le CSV et le JSON sont produits côté API, et le front ne fait que les demander puis déclencher l'enregistrement.

L'autre voie se défendait : le front détient la définition centralisée des Critères (ADR-0004), donc les libellés lisibles et l'ordre des groupes. Un CSV composé là-bas aurait porté « Prix demandé » plutôt que `prixDemande`, ce qui est plus agréable à ouvrir.

Elle a été écartée sur ce que coûte la vérification. Le format a des règles qui se cassent en silence — l'échappement d'un point-virgule dans les Notes, le doublement d'un guillemet, le BOM sans lequel Excel affiche « LibellÃ© », le saut de ligne qui doit rester **dans** la cellule (ADR-0012). Côté API, ces règles se décrivent en tests fonctionnels Japa qui exercent le vrai fichier ; côté front, il aurait fallu les rejouer sur une chaîne fabriquée en mémoire, sans jamais exercer la réponse HTTP que l'acheteur reçoit réellement. Un export est précisément ce qu'on ne relit pas avant d'en avoir besoin : c'est le dernier endroit où accepter une vérification indirecte.

Le second argument est qu'un seul chemin produit les deux formats. Le CSV est construit à partir de l'export JSON, et non des Biens : les deux portent alors les mêmes valeurs **par construction**, et un Critère ajouté entre dans les deux d'un seul geste.

## Les en-têtes du CSV sont les identifiants de colonnes

Conséquence assumée du choix ci-dessus : le tableur affiche `prixDemande`, `surfaceHabitable`, `travauxAPrevoir`.

Recopier les libellés côté API aurait rendu le fichier plus joli, au prix d'une seconde source à tenir d'accord avec `definition.ts` — celle-là même qu'ADR-0004 existe pour supprimer. La duplication qu'ADR-0010 assume déjà pour les Statuts est d'une autre nature : elle est tenue par des tests fonctionnels qui échouent à la divergence, là où des libellés d'export ne casseraient rien en se désaccordant. Ils se contenteraient de vieillir, et personne ne s'en apercevrait — un Critère renommé à l'écran continuerait de sortir sous son ancien nom.

L'identifiant, lui, ne ment jamais sur ce qu'il désigne : c'est le nom du champ tel que l'API l'échange, et celui sous lequel la valeur revient si l'export sert un jour à réinjecter. C'est moins beau, et c'est exact.

Les champs sont **dérivés des colonnes déclarées au modèle** plutôt qu'énumérés, comme l'est déjà `colonnesDeListe` : un Critère ajouté entre dans l'export du seul fait d'exister (ADR-0004). L'ordre est celui de la déclaration, donc celui des migrations successives — et non celui des groupes de l'écran, qui est une affaire de présentation et vit côté front avec les libellés.

## Ce que l'export porte des Photos

Les Photos sortent **par leurs noms de fichiers**, jamais par leurs octets (ADR-0014).

Une photo pèse mille fois ce que pèse un Bien entier. Un export qui les embarquerait cesserait d'être le fichier léger qu'on ouvre dans un tableur, pour devenir une archive qu'on télécharge en espérant que la connexion tienne. Les fichiers sont déjà couverts : le volume entre dans le périmètre de la sauvegarde quotidienne au même titre que la base (ADR-0007, #71).

Le CSV, lui, ne porte que leur **nombre**. Le tableur sert à comparer des Biens, et une colonne de noms de fichiers tirés au sort n'y compare rien — alors que « celui-là, j'en ai douze photos » se lit d'un coup d'œil. Les noms restent dans le JSON, qui est le format complet.

## Le point-virgule, et le BOM

Le séparateur est le point-virgule et non la virgule : c'est ce qu'attend un tableur configuré en français, dont Excel qui lit le séparateur de listes de la locale. Un CSV à la virgule arriverait sur une seule colonne, ce que l'acheteur lirait comme un export cassé plutôt que comme un réglage à changer.

Le fichier commence par un BOM UTF-8. Sans lui, Excel lit le fichier dans sa page de codes locale, et « Libellé » y devient « LibellÃ© ». Le jeu de caractères est aussi annoncé dans l'en-tête HTTP, et les deux se justifient : l'en-tête sert au navigateur qui reçoit la réponse, le BOM sert au tableur qui ouvre le fichier des semaines plus tard, l'en-tête HTTP oublié depuis longtemps.

## Le front passe par une requête, pas par un lien

Un simple `<a href="/api/export">` aurait suffi à télécharger, et c'était plus court.

Il a été écarté parce qu'un lien n'a aucun moyen de dire que l'API n'a pas répondu : l'acheteur verrait une page d'erreur nue à la place de son carnet, en ayant quitté l'application. Le détour par une requête et un blob achète un échec qui se dit **à l'écran**, sur la page où l'on était — et c'est le seul cas qui compte vraiment, un export qu'on croit avoir obtenu étant pire qu'un export refusé.

Le nom du fichier vient de l'en-tête `Content-Disposition` que l'API compose, daté. Le recomposer côté front en ferait une seconde source à tenir d'accord, et un export enregistré sous un nom que l'API n'a pas choisi mentirait sur sa date le jour où les deux divergeraient.

## Ce qui n'est pas fait

**Pas de réimport.** L'export sert à sortir et à conserver, pas à revenir. Une réinjection demanderait de décider ce que devient un Bien déjà présent, ce qu'un carnet mono-utilisateur n'a pas eu à trancher — et la restauration d'une perte réelle passe par le `pg_dump`, qui rend la base entière et non un fichier relu ligne à ligne.

**Pas de filtre sur l'export.** Il porte tout le carnet, Statuts de sortie compris. Un export filtré serait une copie partielle qu'on croirait complète en la retrouvant plus tard, et c'est exactement le malentendu qu'une sauvegarde ne doit pas permettre.
