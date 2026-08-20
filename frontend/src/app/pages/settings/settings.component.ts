import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ContactService } from '../../core/services/contact.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  template: `
    <div class="page">
      <h2>Paramètres</h2>
      <div class="card">
        <p><strong>Nom :</strong> {{ auth.user()?.name }}</p>
        <p><strong>Email :</strong> {{ auth.user()?.email }}</p>
        <p><strong>Organisation :</strong> Plateforme E-Signature</p>
      </div>

      <div class="card">
        <h3>Carnet d’adresses Outlook 365</h3>
        <p class="help">
          Connectez votre compte Microsoft pour choisir un signataire dans votre carnet Outlook
          au lieu de taper l’e-mail.
        </p>
        @if (info()) { <p class="ok">{{ info() }}</p> }
        @if (error()) { <p class="err">{{ error() }}</p> }
        @if (connected()) {
          <p class="ok">Connecté{{ outlookEmail() ? ' : ' + outlookEmail() : '' }}.</p>
          <button type="button" class="ghost" (click)="disconnect()" [disabled]="busy()">Déconnecter Outlook</button>
        } @else {
          <button type="button" class="primary" (click)="connect()" [disabled]="busy()">
            {{ busy() ? 'Ouverture…' : 'Connecter Outlook 365' }}
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    h2{margin:0 0 1rem;font-family:"Space Grotesk",sans-serif;color:#023A6C;}
    h3{margin:0 0 .5rem;color:#023A6C;}
    .card{max-width:560px;background:rgba(255,255,255,.78);border:1px solid rgba(4,104,177,.12);border-radius:.9rem;padding:1.2rem;margin-bottom:1rem;}
    .help{color:#64748b;margin:0 0 .9rem;}
    .ok{color:#0f7b3a;font-weight:600;}
    .err{color:#b91c1c;font-weight:600;}
    button{font:inherit;border-radius:.55rem;padding:.7rem 1rem;font-weight:600;cursor:pointer;}
    .primary{background:#0468B1;color:#fff;border:0;}
    .ghost{background:#fff;color:#0468B1;border:1px solid #0468B1;}
    button:disabled{opacity:.65;cursor:wait;}
  `],
})
export class SettingsComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly contacts = inject(ContactService);
  private readonly route = inject(ActivatedRoute);

  readonly connected = signal(false);
  readonly outlookEmail = signal<string | null>(null);
  readonly busy = signal(false);
  readonly info = signal('');
  readonly error = signal('');

  ngOnInit(): void {
    this.auth.me().subscribe({ error: () => undefined });
    const outlook = this.route.snapshot.queryParamMap.get('outlook');
    if (outlook === 'connected') {
      this.info.set('Outlook 365 est connecté. Cliquez dans le champ Email d’un signataire pour voir vos contacts.');
    } else if (outlook === 'error') {
      this.error.set('La connexion Outlook a échoué ou a été annulée. Réessayez.');
    }
    this.refreshStatus();
  }

  connect() {
    this.busy.set(true);
    this.error.set('');
    this.contacts.connect().subscribe({
      next: (res) => {
        if (res.url) {
          window.location.href = res.url;
          return;
        }
        this.busy.set(false);
        this.error.set('URL Microsoft introuvable.');
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.error?.message || 'Outlook 365 n’est pas encore configuré sur le serveur.');
      },
    });
  }

  disconnect() {
    this.busy.set(true);
    this.contacts.disconnect().subscribe({
      next: () => {
        this.busy.set(false);
        this.connected.set(false);
        this.outlookEmail.set(null);
        this.info.set('Outlook a été déconnecté.');
      },
      error: () => {
        this.busy.set(false);
        this.error.set('Impossible de déconnecter Outlook.');
      },
    });
  }

  private refreshStatus() {
    this.contacts.status().subscribe({
      next: (status) => {
        this.connected.set(!!status?.connected);
        this.outlookEmail.set(status?.email || null);
      },
      error: () => undefined,
    });
  }
}
