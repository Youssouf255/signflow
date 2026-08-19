import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">Plateforme E-Signature</div>
        <nav>
          <a routerLink="/app/dashboard" routerLinkActive="active">Dashboard</a>
          <a routerLink="/app/documents" routerLinkActive="active">Documents</a>
          <a routerLink="/app/signers" routerLinkActive="active">Signataires</a>
          <a routerLink="/app/settings" routerLinkActive="active">Paramètres</a>
        </nav>
        <button class="logout" type="button" (click)="auth.logout()">Déconnexion</button>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="user">👤 {{ auth.user()?.name || 'Utilisateur' }}</div>
          <img class="pnud-logo" src="/pnud-logo.png" alt="PNUD" />
        </header>
        <section class="content">
          <router-outlet />
        </section>
      </main>
    </div>
  `,
  styles: [`
    .shell { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; background: linear-gradient(160deg, #F5F9FC 0%, #E8F3FA 45%, #FFFFFF 100%); }
    .sidebar { background: #0468B1; color: #fff; padding: 1.5rem 1rem; display: flex; flex-direction: column; gap: 1.5rem; }
    .brand {
      font-family: "Space Grotesk", sans-serif; font-weight: 700;
      font-size: 1.05rem; line-height: 1.25; color: #fff;
    }
    nav { display: flex; flex-direction: column; gap: .35rem; flex: 1; }
    nav a { color: #D6EAF8; text-decoration: none; padding: .7rem .85rem; border-radius: .5rem; }
    nav a.active, nav a:hover { background: rgba(255,255,255,.14); color: #fff; }
    .logout { margin-top: auto; background: transparent; border: 1px solid rgba(255,255,255,.35); color: #fff; border-radius: .5rem; padding: .6rem; cursor: pointer; }
    .main { display: flex; flex-direction: column; min-width: 0; }
    .topbar {
      display: flex; justify-content: flex-end; align-items: center; gap: 1rem;
      padding: .75rem 1.5rem; background: #fff; border-bottom: 1px solid rgba(4,104,177,.12);
    }
    .user { font-weight: 600; color: #023A6C; }
    .pnud-logo {
      height: 56px; width: auto; display: block;
      object-fit: contain;
    }
    .content { padding: 1rem 1.5rem 2rem; }
    @media (max-width: 860px) {
      .shell { grid-template-columns: 1fr; }
      .sidebar { position: sticky; top: 0; z-index: 5; }
      nav { flex-direction: row; flex-wrap: wrap; }
    }
  `],
})
export class ShellComponent {
  readonly auth = inject(AuthService);
}
