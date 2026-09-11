# Photos sur un volume, redimensionnées à l'arrivée, fichiers effacés avant la ligne

Les photos d'un Bien vivent en fichiers sur un volume Docker, et non en base. Une photo pèse mille fois ce que pèse un Bien entier : `pg_dump` n'est pas fait pour transporter des mégaoctets de binaire, et une sauvegarde quotidienne qui les embarquerait cesserait d'être la chose légère que décrit ADR-0007. La base ne porte donc que des **noms de fichiers** — jamais des chemins, la racine étant une affaire de configuration (`STOCKAGE_PHOTOS`) qui change d'un environnement à l'autre.

Le volume entre dans le périmètre des sauvegardes au même titre que la base, ce qu'ADR-0007 prévoyait déjà. C'est la moitié irremplaçable du carnet : une photo de visite ne se reprend pas, là où un Critère mal saisi se resaisit.

## Les fichiers sont servis par l'API, pas par nginx

Un dossier exposé en statique serait lisible par qui en devine le nom. Les photos d'un intérieur sont au moins aussi sensibles que le reste du carnet, et la route qui les sert est donc dans le groupe authentifié comme toutes les autres (ADR-0011). Le coût est un passage de plus par Node pour chaque image ; à l'échelle d'un utilisateur unique, il ne se mesure pas.

L'adresse porte l'identifiant du Bien **et** celui de la photo, et les deux sont vérifiés. Sans cela, connaître un identifiant de photo suffirait à la lire sous n'importe quel Bien.

## Le redimensionnement est fait à l'arrivée, côté API

Deux versions sont écrites pour chaque envoi : une version consultable (1600px) et une vignette (400px) que portent la liste et les cartes. L'original n'est pas conservé — il ne sert aucun écran, et le garder ferait grossir le volume, donc les sauvegardes, d'un facteur dix pour une image que personne n'ouvrirait.

Le faire au navigateur aurait épargné la connexion mobile à l'envoi, et c'était l'argument sérieux en face. Il a été écarté parce que le critère porte sur ce qui est **stocké et servi**, pas sur ce qu'un écran veut bien envoyer : une garantie qui ne tient que tant qu'on passe par la page web n'en est pas une. Le prix est une dépendance native (`sharp`) dans l'image Alpine.

L'orientation EXIF est appliquée aux pixels au passage. Sans cela, une photo prise en portrait — le cas courant d'une visite — s'afficherait couchée : le capteur écrit l'image dans son sens et note la rotation à côté, et la recompression perdrait cette note.

## Les fichiers partent avant la ligne

`ON DELETE CASCADE` règle les lignes de photos quand un Bien est supprimé. Les fichiers n'ont pas cet équivalent : aucune contrainte de base ne balaie un volume. L'ordre des deux gestes devait donc être choisi, et il l'est — **les fichiers d'abord, la ligne ensuite**, pour la suppression d'une photo seule comme pour celle d'un Bien entier.

Les deux sens se défendaient, mais ils ne coûtent pas la même chose. La ligne partie la première laisserait sur le volume des fichiers que plus rien ne désigne : des orphelins qu'aucun écran ne montre, que seul un balayage périodique retrouverait, et qu'il aurait fallu écrire et planifier. Dans ce sens-ci, le pire qui arrive est une ligne qui subsiste un instant après un effacement manqué — et cette ligne est précisément ce qui permet de réessayer.

Deux conséquences en découlent :

- **Un fichier déjà absent est un succès.** L'état visé est atteint, et il n'y a rien à signaler.
- **Tout autre échec — disque plein, volume démonté — arrête la suppression.** La ligne reste, et l'écran le dit.

Ce second point mérite d'être défendu, parce que l'inverse était tentant : journaliser l'échec et supprimer la ligne quand même, pour ne pas retenir dans le carnet un Bien dont l'acheteur a demandé la disparition. C'est ce qui avait d'abord été écrit, et c'était incohérent — cela produisait très exactement l'orphelin que l'ordre choisi existe pour éviter, et retirait du même coup la seule trace permettant de réessayer. Un ordre choisi pour éviter les orphelins ne peut pas en fabriquer sur son chemin d'échec.

L'échec est rare et il se répare : c'est un incident de disque, pas un refus. Le Bien encore présent est ce qui permet de recommencer une fois le disque libéré, là où un succès annoncé à tort ferait chercher plus tard des fichiers que plus rien ne désigne.

Le geste est écrit une fois (`stockage_photos.ts`) et appelé deux : la suppression d'une photo et celle d'un Bien posent la même question à un cran d'écart, et répondent pareil.

### Ce que cela change pour le test-sentinelle de #9

#9 posait un garde qui exigeait qu'**aucune** clé étrangère ne pointe vers `biens`, pour signaler le jour où quelque chose s'y rattacherait. C'est arrivé, et la réponse n'a pas été de l'assouplir : il est remplacé par ce qu'il gardait vraiment — la ligne partie, il ne reste rien du Bien **nulle part**, volume compris. L'ancien garde ne regardait que les lignes ; c'est très exactement le trou que le nouveau ferme.

## Ce qui n'est pas fait

Pas de balayage périodique des orphelins. L'ordre choisi ci-dessus les rend improbables plutôt qu'impossibles, et écrire un balayage pour un carnet mono-utilisateur reviendrait à entretenir du code pour un cas qui ne s'est pas présenté. Si des orphelins apparaissent, c'est le moment d'en faire un ticket — pas avant.

Les photos ne se réordonnent pas. La représentative est la première ajoutée, rang le plus petit : « représentative » ne se choisit pas, et un drapeau à cocher serait un geste de plus pendant la visite, là où le geste doit rester rapide. C'est une limite assumée, pas un oubli.

HEIC n'est pas accepté, alors que les iPhone le produisent par défaut. Le navigateur ne sait pas l'afficher, et les appareils le convertissent en JPEG au moment de l'envoi depuis une page web — ce qui est très exactement le chemin que prend une photo ici.
