# Stack : Angular, AdonisJS, PostgreSQL, déployés par Docker

Le front est en Angular, l'API en AdonisJS, les données en PostgreSQL, l'ensemble déployé par Docker sur un VPS personnel déjà en service avec son nom de domaine.

Le critère décisif est la familiarité du développeur, seul contributeur du projet : sur un outil personnel, la vitesse d'exécution dans une stack maîtrisée l'emporte sur les mérites théoriques d'une autre. SQLite avait été proposé au vu du volume réel (un utilisateur, quelques centaines de Biens au plus) et écarté : PostgreSQL dans le même docker-compose ne représente pas une charge d'administration significative sur un VPS déjà géré.

Conséquence à surveiller : la sauvegarde n'est plus la simple copie de fichier qu'aurait offerte SQLite. Un `pg_dump` périodique doit être mis en place — les données sont saisies à la main (ADR-0001) et donc irrécupérables en cas de perte.
