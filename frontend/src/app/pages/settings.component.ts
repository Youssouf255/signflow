import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <h1>Parametres</h1>
      <div class="card">
        <p><strong>Nom :</strong> {{ auth.user()?.name }}</p>
        <p><strong>Email :</strong> {{ auth.user()?.email }}</p>
        <p class="muted">MVP Plateforme E-Signature — authentification Sanctum, audit trail et liens securises.</p>
      </div>
    </div>
  `,
  styles: [`
    h1 { font-family: "Fraunces", Georgia, serif; color: #023A6C; }
    .card { background: #fff; border: 1px solid #d7e5e2; border-radius: 16px; padding: 1.2rem; }
    .muted { color: #64748b; }
  `],
})
export class SettingsComponent {
  constructor(public auth: AuthService) {}
}
