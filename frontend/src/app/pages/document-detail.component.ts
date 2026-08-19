import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DocumentService } from '../core/document.service';
import { DocItem } from '../core/models';

@Component({
  selector: 'app-document-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page" *ngIf="doc">
      <div class="head">
        <div>
          <h1>{{ doc.title }}</h1>
          <p>{{ doc.reference }} · {{ doc.status }}</p>
        </div>
        <a *ngIf="doc.status === 'draft'" class="btn" [routerLink]="['/app/documents', doc.id, 'editor']">Continuer l'edition</a>
      </div>

      <div class="grid">
        <section class="card">
          <h2>Signataires</h2>
          <div class="row" *ngFor="let s of doc.signers">
            <div>
              <strong>{{ s.first_name }} {{ s.last_name }}</strong>
              <small>{{ s.email }} · Ordre {{ s.signing_order }} · {{ s.role }}</small>
            </div>
            <span>{{ s.status }}</span>
          </div>
        </section>

        <section class="card">
          <h2>Traçabilite</h2>
          <div class="row" *ngFor="let log of doc.audit_logs">
            <div>
              <strong>{{ log.event }}</strong>
              <small>{{ log.created_at | date:'dd/MM/yyyy HH:mm:ss' }} · IP {{ log.ip_address || '-' }}</small>
            </div>
          </div>
          <p *ngIf="doc.original_hash"><strong>Hash :</strong> {{ doc.signed_hash || doc.original_hash }}</p>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .head { display:flex; justify-content:space-between; gap:1rem; align-items:flex-start; margin-bottom:1rem; }
    h1 { font-family:"Fraunces", Georgia, serif; color:#023A6C; margin:0; }
    .btn { background:#0468B1; color:#fff; text-decoration:none; padding:.7rem 1rem; border-radius:10px; font-weight:700; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:1rem; }
    .card { background:#fff; border:1px solid #d7e5e2; border-radius:16px; padding:1rem; }
    h2 { margin:0 0 .8rem; color:#023A6C; font-size:1rem; }
    .row { display:flex; justify-content:space-between; gap:1rem; padding:.7rem 0; border-bottom:1px solid #eef2f1; }
    .row strong { display:block; }
    .row small { color:#64748b; }
    @media (max-width: 900px) { .grid { grid-template-columns:1fr; } }
  `],
})
export class DocumentDetailComponent implements OnInit {
  doc: DocItem | null = null;

  constructor(private route: ActivatedRoute, private documents: DocumentService) {}

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.documents.get(id).subscribe((doc) => (this.doc = doc));
  }
}
