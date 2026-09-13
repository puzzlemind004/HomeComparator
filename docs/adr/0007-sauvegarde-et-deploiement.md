# Sauvegarde par pg_dump, copie hors-site reportée, déploiement par GitHub Actions

Les données de HomeComparator sont saisies entièrement à la main (ADR-0001) et donc irrécupérables en cas de perte : la sauvegarde est une exigence, pas une commodité.

Un `pg_dump` quotidien, avec une rétention de 7 sauvegardes quotidiennes et 4 hebdomadaires — un dump compressé pesant quelques dizaines de kilo-octets pour ce volume, la rétention longue ne coûte rien et couvre l'erreur découverte tardivement. Le volume Docker contenant les photos entre dans le même périmètre. Un bouton d'export manuel dans l'interface (JSON/CSV) complète le dispositif : il sert aussi à sortir les données vers un tableur et à ne pas rendre l'outil captif.

## Un service de la pile, et non un cron sur le VPS

Cette décision disait d'abord « par cron sur le VPS ». L'implémentation (#71) a retenu un **service de la pile**, et l'écart mérite d'être écrit plutôt que subi.

Un crontab posé à la main sur le serveur ne vit pas dans le dépôt : il ne se déploie pas avec le reste, il ne se relit pas, et une sauvegarde qui cesse de tourner dans un crontab que personne n'ouvre cesse de tourner sans le dire. Ce qui décrit la production vit dans le dépôt et se déploie d'un geste (#69, ADR-0018) ; la sauvegarde ne fait pas exception.

Le service tourne sur la même image que la base, `pg_dump` devant être d'une version au moins égale à celle du serveur — les faire diverger produirait une panne nocturne et silencieuse. Sa boucle vise chaque nuit une heure absolue en UTC plutôt que de dormir vingt-quatre heures, un `sleep` de cette longueur dérivant d'autant que le travail a duré.

L'essentiel de la décision est inchangé : un `pg_dump` quotidien, la rétention 7/4, les Photos dans le même périmètre, la copie hors-site reportée.

## La copie hors-site est reportée

L'hébergeur du VPS (Hostinger) réalise des snapshots automatiques de la machine, ce qui couvre déjà la perte matérielle et fait du dispositif un ensemble à deux niveaux plutôt qu'une sauvegarde unique. La copie vers un stockage tiers est donc traitée comme un chantier indépendant, à mener plus tard si le besoin se confirme, plutôt que comme un prérequis du produit.

Limite à garder en tête : les deux niveaux ne couvrent pas la même chose. Le snapshot Hostinger restaure le VPS entier et sa fréquence est celle de l'offre souscrite ; le `pg_dump` quotidien est ce qui permet de récupérer une donnée précise supprimée par erreur, sans toucher au reste du serveur. C'est ce dernier qui porte l'essentiel de la protection au quotidien.

Si la copie hors-site est reprise, l'étude comparative a retenu deux candidats sans carte bancaire : **Backblaze B2** (10 Go gratuits, clé applicative en écriture seule restreinte à un bucket — mais le plafond de dépense n'est PAS actif par défaut et doit être configuré explicitement dès le premier jour), et **Google Drive** sur compte dédié via rclone (15 Go, blocage natif garanti sans configuration, mais aucune protection contre la suppression). Cloudflare R2 est disqualifié : carte bancaire obligatoire et aucun plafond de dépense. GitHub comme cible est à écarter — git versionne chaque binaire éternellement et le dossier de photos ferait gonfler le dépôt sans purge possible.

## Déploiement

GitHub Actions plutôt qu'un `git pull` manuel sur le VPS, conformément à ADR-0005. Le pipeline exécute lint, compilation TypeScript et tests, et ne déploie que si tout passe — une CI qui se contente de déployer n'étant qu'un `git pull` avec des étapes supplémentaires.
