import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { DocumentService } from '../core/document.service';
import { DashboardData } from '../core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page" *ngIf="data">
      <h1>Bonjour {{ auth.user()?.name }}</h1>
      <p class="sub">Vue d'ensemble de votre activite de signature.</p>

      <div class="stats">
        <div class="stat"><strong>{{ data.stats.sent }}</strong><span>Envoyes</span></div>
        <div class="stat"><strong>{{ data.stats.in_progress }}</strong><span>En cours</span></div>
        <div class="stat"><strong>{{ data.stats.completed }}</strong><span>Signes</span></div>
        <div class="stat"><strong>{{ data.stats.draft }}</strong><span>Brouillons</span></div>
      </div>

      <div class="section-head">
        <h2>Documents recents</h2>
        <a class="btn" routerLink="/app/documents/new">+ Envoyer un document</a>
      </div>

      <div class="list">
        <a class="row" *ngFor="let doc of data.recent" [routerLink]="['/app/documents', doc.id]">
          <div>
            <strong>{{ doc.title }}</strong>
            <small>{{ doc.reference }}</small>
          </div>
          <span class="badge" [attr.data-status]="doc.status">{{ statusLabel(doc.status) }}</span>
        </a>
        <p *ngIf="!data.recent.length" class="empty">Aucun document pour le moment.</p>
      </div>
    </div>
  `,
  styles: [`
    h1 { font-family: "Fraunces", Georgia, serif; color: #023A6C; margin: 0; }
    .sub { color: #64748b; margin-top: .4rem; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 1rem; margin: 1.5rem 0; }
    .stat {
      background: #fff; border: 1px solid #d7e5e2; border-radius: 16px; padding: 1.1rem 1rem;
      display: grid; gap: .25rem;
    }
    .stat strong { font-size: 1.8rem; color: #0468B1; }
    .stat span { color: #475569; font-weight: 600; }
    .section-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem; }
    .section-head h2 { margin: 0; color: #023A6C; font-size: 1.15rem; }
    .btn {
      background: #0468B1; color: #fff; text-decoration: none; padding: .7rem 1rem; border-radius: 10px; font-weight: 700;
    }
    .list { background: #fff; border: 1px solid #d7e5e2; border-radius: 16px; overflow: hidden; }
    .row {
      display: flex; justify-content: space-between; gap: 1rem; padding: 1rem 1.1rem;
      text-decoration: none; color: inherit; border-bottom: 1px solid #e8f0ee;
    }
    .row:last-child { border-bottom: 0; }
    .row strong { display: block; color: #023A6C; }
    .row small { color: #64748b; }
    .badge {
      align-self: center; padding: .35rem .7rem; border-radius: 999px; font-size: .8rem; font-weight: 700;
      background: #ecfeff; color: #0468B1;
    }
    .badge[data-status='completed'] { background: #dcfce7; color: #166534; }
    .badge[data-status='in_progress'], .badge[data-status='sent'] { background: #ffedd5; color: #9a3412; }
    .badge[data-status='declined'] { background: #fee2e2; color: #991b1b; }
    .empty { padding: 1.2rem; color: #64748b; }
    @media (max-width: 900px) { .stats { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  `],
})
export class DashboardComponent implements OnInit {
  data: DashboardData | null = null;

  constructor(public auth: AuthService, private documents: DocumentService) {}

  ngOnInit() {
    this.documents.dashboard().subscribe((data) => (this.data = data));
  }

  statusLabel(status: string) {
    const map: Record<string, string> = {
      draft: 'Brouillon',
      sent: 'Envoye',
      in_progress: 'En cours',
      completed: 'Signe',
      declined: 'Refuse',
      expired: 'Expire',
      cancelled: 'Annule',
    };
    return map[status] || status;
  }
}
