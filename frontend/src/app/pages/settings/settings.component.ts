import { Component, OnInit, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

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
    </div>
  `,
  styles: [`
    h2{margin:0 0 1rem;font-family:"Space Grotesk",sans-serif;color:#023A6C;}
    .card{max-width:560px;background:rgba(255,255,255,.78);border:1px solid rgba(4,104,177,.12);border-radius:.9rem;padding:1.2rem;}
  `],
})
export class SettingsComponent implements OnInit {
  readonly auth = inject(AuthService);

  ngOnInit(): void {
    this.auth.me().subscribe({ error: () => undefined });
  }
}
