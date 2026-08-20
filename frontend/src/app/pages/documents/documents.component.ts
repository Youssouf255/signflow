import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DocumentItem, DocumentService } from '../../core/services/document.service';

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [RouterLink, FormsModule, DatePipe],
  template: `
    <div class="page">
      <div class="head">
        <h2>Documents</h2>
        <a class="cta" routerLink="/app/documents/new">+ Envoyer un document</a>
      </div>
      @if (invitedNotice()) {
        <div class="notice">{{ invitedNotice() }}</div>
      }
      <div class="filters">
        <input [(ngModel)]="search" (ngModelChange)="load()" placeholder="Rechercher..." />
        <select [(ngModel)]="status" (ngModelChange)="load()">
          <option value="">Tous les statuts</option>
          <option value="draft">Brouillon</option>
          <option value="in_progress">En cours</option>
          <option value="completed">Signé</option>
          <option value="declined">Refusé</option>
        </select>
      </div>
      <div class="list">
        @for (doc of items(); track doc.id) {
          <a class="row" [routerLink]="['/app/documents', doc.id]">
            <div>
              <strong>{{ doc.title }}</strong>
              <small>{{ doc.signers_count || 0 }} signataire(s) · {{ doc.created_at | date:'short' }}</small>
            </div>
            <span class="badge">{{ statusLabel(doc.status) }}</span>
          </a>
        } @empty {
          <p>Aucun document.</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .head { display:flex; justify-content:space-between; align-items:center; gap:1rem; margin-bottom:1rem; }
    h2 { margin:0; font-family:"Space Grotesk",sans-serif; color:#023A6C; }
    .cta { background:#0468B1; color:#fff; text-decoration:none; padding:.7rem 1rem; border-radius:.55rem; font-weight:600; }
    .filters { display:flex; gap:.7rem; margin-bottom:1rem; }
    input, select { border:1px solid #cbd5e1; border-radius:.55rem; padding:.65rem .8rem; font:inherit; background:#fff; }
    .list { display:grid; gap:.55rem; }
    .row { display:flex; justify-content:space-between; gap:1rem; padding:1rem; background:rgba(255,255,255,.75); border-radius:.75rem; text-decoration:none; color:inherit; border:1px solid rgba(15,23,42,.06); }
    small { display:block; color:#64748b; margin-top:.2rem; }
    .badge { align-self:center; background:#e2e8f0; padding:.25rem .55rem; border-radius:999px; font-size:.78rem; text-transform:capitalize; }
    .notice { background:#D6EAF8; border:1px solid #0468B1; color:#023A6C; padding:.85rem 1rem; border-radius:.7rem; margin-bottom:1rem; line-height:1.45; }
  `],
})
export class DocumentsComponent implements OnInit {
  private readonly documents = inject(DocumentService);
  private readonly route = inject(ActivatedRoute);
  readonly items = signal<DocumentItem[]>([]);
  readonly invitedNotice = signal('');
  search = '';
  status = '';

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap.get('status') || '';
    // "Envoyés" includes several statuses; list filter uses exact status.
    this.status = q === 'sent' ? '' : q;
    if (this.route.snapshot.queryParamMap.get('invited') === '1') {
      const to = this.route.snapshot.queryParamMap.get('to') || '';
      const failed = this.route.snapshot.queryParamMap.get('failed') || '';
      if (failed) {
        this.invitedNotice.set(
          'L’e-mail n’a pas pu partir vers ' + failed +
          '. Une nouvelle tentative part automatiquement. Vérifiez aussi les courriers indésirables (spam) Yahoo.'
        );
      } else if (to) {
        this.invitedNotice.set(
          'Invitation envoyée à ' + to +
          '. Si rien n’arrive, vérifiez les courriers indésirables (spam). Après sa signature, le suivant sera notifié. Quand tout le monde aura signé, chacun recevra le PDF final.'
        );
      } else {
        this.invitedNotice.set(
          'Invitation envoyée au premier signataire par e-mail. Vérifiez aussi les courriers indésirables (spam), surtout sur Yahoo. Après sa signature, le suivant recevra la notification. Quand tout le monde aura signé, chaque signataire recevra le PDF final.'
        );
      }
    }
    this.load();
  }

  load() {
    this.documents.list({ search: this.search, status: this.status }).subscribe((res) => {
      this.items.set(res.data || []);
    });
  }

  statusLabel(status: string): string {
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
