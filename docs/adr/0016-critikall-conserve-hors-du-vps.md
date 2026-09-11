# Les données de `critikall` sont conservées hors du VPS, pas dans la pile du carnet

`critikall` est un projet abandonné dont la base vivait sur l'instance
PostgreSQL de l'hôte. Ses données sont conservées, mais sous forme d'archive
hors du serveur, et non restaurées dans le PostgreSQL du carnet.

Les loger dans le conteneur du carnet aurait fait entrer une base étrangère dans
la pile de production : elle serait apparue dans les sauvegardes, dans les
restaurations et dans la surveillance d'un produit auquel elle n'appartient pas.
La consultation occasionnelle, seul usage envisagé, ne demande pas qu'elles
soient en ligne : une restauration locale dans pgAdmin y suffit.

Ces données ont un statut différent de celles du carnet. Le carnet est
réalimenté chaque jour, ce qui rend une sauvegarde quotidienne sur la machine
acceptable (ADR-0007, qui reporte la copie hors-site en s'appuyant sur les
snapshots Hostinger). `critikall` est figé : il n'en existera jamais de nouvelle
version, et les snapshots de l'hébergeur tournent — ce n'est pas une archive.
Conserver ces données uniquement sur le serveur que l'on s'apprête à
reconfigurer les ferait dépendre de la machine que l'on manipule.

## Ce que cela impose

Le `pg_dump -Fc` de la base et le `pg_dumpall --globals-only` des rôles sont
rapatriés hors du VPS **avant** toute suppression de l'instance hôte — le dump
d'une base seule ne porte pas les rôles et se restaure mal sans eux. L'ordre est
celui tenu pendant le durcissement (#72) : ajouter et prouver avant de retirer.

Le volume tient dans quelques centaines de kilo-octets, ce qui rend la question
du support secondaire : tout emplacement qui n'est pas ce VPS convient.
