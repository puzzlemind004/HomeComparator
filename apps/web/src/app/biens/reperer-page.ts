import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BienService } from './bien.service';
import { ROUTE_BIENS, routeFicheBien } from './carnet.routes';

/**
 * L'écran où se repère un Bien : un Libellé, une URL d'Annonce, et retour au
 * carnet.
 *
 * **Il est séparé de la liste**, ce que la maquette demande. Le formulaire
 * vivait en tête du carnet, et il y coûtait cher : la liste est ce qu'on
 * vient voir en ouvrant l'application, et deux champs plus un bouton la
 * repoussaient sous la ligne de flottaison à chaque fois. Le repérage reste
 * le geste qui alimente le carnet — c'est pourquoi il a son bouton dans
 * l'en-tête de la liste, et non une entrée noyée dans un menu.
 *
 * Ce que ADR-0008 demande — « une annonce vue le soir, à enregistrer en
 * quelques secondes » — est tenu par le chemin plutôt que par la place :
 * un appui sur « + », deux champs, un bouton. Le Bien créé mène directement à
 * sa fiche, où l'assistant attend : c'est la suite naturelle du geste, et
 * elle évite de rechercher dans la liste le Bien qu'on vient d'y mettre.
 */
@Component({
  selector: 'app-reperer-page',
  imports: [FormsModule, RouterLink],
  styleUrl: './reperer-page.scss',
  templateUrl: './reperer-page.html',
})
export class RepererPage {
  private readonly bienService = inject(BienService);
  private readonly router = inject(Router);

  /** Où l'on revient en renonçant : le carnet, d'où l'on vient. */
  readonly routeBiens = ROUTE_BIENS;

  /**
   * L'état lu par le gabarit. Il est public plutôt que `protected` pour
   * rester lisible par les tests, qui l'interrogent là où ils devraient
   * sinon inspecter le DOM rendu.
   */
  readonly libelle = signal('');
  readonly urlAnnonce = signal('');

  readonly erreurs = signal<string[]>([]);
  readonly enregistrement = signal(false);

  /**
   * Le repérage, puis la fiche du Bien créé.
   *
   * Mener à la fiche plutôt que de revenir à la liste : c'est là que se
   * renseigne ce qu'on sait déjà de l'annonce, et l'assistant y attend. Un
   * retour à la liste aurait obligé à y retrouver le Bien qu'on vient d'y
   * mettre — un Bien qu'on ne reconnaît encore qu'à son Libellé, parmi tous
   * les autres.
   */
  creer(): void {
    if (this.enregistrement()) {
      return;
    }

    this.enregistrement.set(true);
    this.erreurs.set([]);

    this.bienService
      .creer({ libelle: this.libelle(), urlAnnonce: this.urlAnnonce() })
      .subscribe((resultat) => {
        this.enregistrement.set(false);

        if (!resultat.cree) {
          this.erreurs.set(resultat.erreurs);
          return;
        }

        void this.router.navigateByUrl(routeFicheBien(resultat.bien.id));
      });
  }
}
