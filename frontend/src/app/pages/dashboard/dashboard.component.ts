import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DocumentItem, DocumentService } from '../../core/services/document.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe],
  template: `
    <div class="page">
      <div class="hero">
        <div>
          <h2>Bonjour {{ auth.user()?.name }}</h2>
          <p class="sub">Suivi de vos envois et signatures sur Plateforme E-Signature.</p>
        </div>
        <a class="cta" routerLink="/app/documents/new">+ Envoyer un document</a>
      </div>

      <div class="stats">
        <a class="stat sent" routerLink="/app/documents" [queryParams]="{ status: 'sent' }">
          <span class="label">Envoyés</span>
          <strong>{{ counts().sent }}</strong>
          <small>Documents déjà transmis</small>
        </a>
        <a class="stat progress" routerLink="/app/documents" [queryParams]="{ status: 'in_progress' }">
          <span class="label">En cours</span>
          <strong>{{ counts().in_progress }}</strong>
          <small>En attente de signature</small>
        </a>
        <a class="stat done" routerLink="/app/documents" [queryParams]="{ status: 'completed' }">
          <span class="label">Signés</span>
          <strong>{{ counts().completed }}</strong>
          <small>Processus terminés</small>
        </a>
        <a class="stat draft" routerLink="/app/documents" [queryParams]="{ status: 'draft' }">
          <span class="label">Brouillons</span>
          <strong>{{ counts().draft }}</strong>
          <small>À finaliser / renvoyer</small>
        </a>
      </div>

      <div class="section-head">
        <h3>Documents récents</h3>
        <a class="link" routerLink="/app/documents">Voir tous</a>
      </div>

      <div class="list">
        @for (doc of recent(); track doc.id) {
          <a class="row" [routerLink]="['/app/documents', doc.id]">
            <div>
              <strong>{{ doc.title }}</strong>
              <small>{{ doc.created_at | date:'short' }} · {{ doc.signers_count || 0 }} signataire(s)</small>
            </div>
            <span class="badge" [attr.data-status]="doc.status">{{ label(doc.status) }}</span>
          </a>
        } @empty {
          <p class="empty">Aucun document pour le moment.</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .hero {
      display:flex; justify-content:space-between; align-items:flex-end; gap:1rem;
      margin-bottom:1.4rem; padding:1.2rem 1.3rem; border-radius:1rem;
      background: linear-gradient(135deg, #0468B1 0%, #023A6C 100%); color:#fff;
    }
    h2 { font-family:"Space Grotesk",sans-serif; margin:.25rem 0 .35rem; font-size:1.7rem; }
    .sub { margin:0; opacity:.9; font-size:.92rem; }
    .cta {
      background:#fff; color:#0468B1; text-decoration:none; padding:.75rem 1rem;
      border-radius:.55rem; font-weight:700; white-space:nowrap;
    }
    .stats {
      display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:1rem; margin-bottom:1.8rem;
    }
    .stat {
      display:grid; gap:.25rem; text-decoration:none; color:inherit;
      background:#fff; border:1px solid rgba(4,104,177,.12); border-radius:1rem;
      padding:1.1rem 1.15rem; box-shadow:0 8px 24px rgba(2,58,108,.06);
      border-top:4px solid #0468B1; transition: transform .15s ease, box-shadow .15s ease;
    }
    .stat:hover { transform: translateY(-2px); box-shadow:0 12px 28px rgba(2,58,108,.1); }
    .stat.sent { border-top-color:#0468B1; }
    .stat.progress { border-top-color:#C2410C; }
    .stat.done { border-top-color:#15803D; }
    .stat.draft { border-top-color:#64748b; }
    .stat .label { font-size:.8rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.04em; }
    .stat strong { font-size:2rem; line-height:1.1; color:#023A6C; font-family:"Space Grotesk",sans-serif; }
    .stat.sent strong { color:#0468B1; }
    .stat.progress strong { color:#C2410C; }
    .stat.done strong { color:#15803D; }
    .stat.draft strong { color:#475569; }
    .stat small { color:#94a3b8; font-size:.78rem; }
    .section-head { display:flex; justify-content:space-between; align-items:center; gap:1rem; margin-bottom:.8rem; }
    h3 { margin:0; color:#1e293b; }
    .link { color:#0468B1; font-weight:600; text-decoration:none; }
    .list { display:grid; gap:.6rem; }
    .row {
      display:flex; justify-content:space-between; align-items:center; gap:1rem;
      padding:1rem 1.1rem; background:rgba(255,255,255,.9); border-radius:.75rem;
      text-decoration:none; color:inherit; border:1px solid rgba(4,104,177,.1);
    }
    .row small { display:block; color:#64748b; margin-top:.2rem; }
    .badge { font-size:.78rem; padding:.25rem .55rem; border-radius:999px; background:#e2e8f0; font-weight:600; }
    .badge[data-status="completed"] { background:#DCFCE7; color:#166534; }
    .badge[data-status="in_progress"], .badge[data-status="sent"] { background:#FFEDD5; color:#9A3412; }
    .badge[data-status="draft"] { background:#E2E8F0; color:#334155; }
    .empty { color:#64748b; }
    @media (max-width:980px){ .stats{grid-template-columns:repeat(2,minmax(0,1fr));} }
    @media (max-width:700px){
      .stats{grid-template-columns:1fr;}
      .hero{flex-direction:column; align-items:flex-start;}
      .section-head{flex-direction:column; align-items:flex-start;}
    }
  `],
})
export class DashboardComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly documents = inject(DocumentService);

  readonly counts = signal({ sent: 0, in_progress: 0, completed: 0, draft: 0 });
  readonly recent = signal<DocumentItem[]>([]);

  ngOnInit(): void {
    this.documents.dashboard().subscribe((res: any) => {
      const stats = res.stats || res.counts || {};
      this.counts.set({
        sent: Number(stats.sent || 0),
        in_progress: Number(stats.in_progress || 0),
        completed: Number(stats.completed || 0),
        draft: Number(stats.draft || 0),
      });
      this.recent.set(res.recent || []);
    });
  }

  label(status: string): string {
    const map: Record<string, string> = {
      draft: 'Brouillon',
      sent: 'Envoyé',
      in_progress: 'En cours',
      completed: 'Signé',
      declined: 'Refusé',
      expired: 'Expiré',
    };
    return map[status] || status;
  }
}
