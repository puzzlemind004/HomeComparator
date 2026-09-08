import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * L'écran de connexion : un mot de passe, et rien d'autre.
 *
 * Il n'y a qu'un utilisateur (#4) : pas d'identifiant à saisir, pas
 * d'inscription, pas de mot de passe oublié. Un formulaire qui proposerait
 * l'un de ces gestes mentirait sur ce que l'outil sait faire.
 */
@Component({
  selector: 'app-connexion-page',
  imports: [FormsModule],
  styleUrl: './connexion-page.scss',
  templateUrl: './connexion-page.html',
})
export class ConnexionPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /**
   * L'état lu par le gabarit. Public plutôt que `protected` pour rester
   * lisible par les tests, qui l'interrogent là où ils devraient sinon
   * inspecter le DOM rendu.
   */
  readonly motDePasse = signal('');
  readonly erreur = signal<string | null>(null);
  readonly connexionEnCours = signal(false);

  connecter(): void {
    if (this.connexionEnCours()) {
      return;
    }

    this.connexionEnCours.set(true);
    this.erreur.set(null);

    this.auth.connecter(this.motDePasse()).subscribe((resultat) => {
      this.connexionEnCours.set(false);

      if (!resultat.connecte) {
        this.erreur.set(resultat.erreur);
        // Le champ est vidé : la saisie refusée n'a plus de valeur, et la
        // laisser inviterait à resoumettre la même chose.
        this.motDePasse.set('');
        return;
      }

      void this.router.navigateByUrl('/');
    });
  }
}
