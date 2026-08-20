import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AuditLog, DocumentItem, DocumentService, SignatureField, Signer } from '../../core/services/document.service';

@Component({
  selector: 'app-document-detail',
  standalone: true,
  imports: [RouterLink, DatePipe],
  template: `
    @if (doc(); as d) {
      <div class="page">
        <div class="head">
          <div>
            <h2>{{ d.title }}</h2>
            <p>{{ d.description || 'Sans description' }}</p>
          </div>
          <div class="actions">
            @if (d.status === 'draft') {
              @if (!(d.signers?.length)) {
                <a class="cta" [routerLink]="['/app/documents', d.id, 'signers']">Ajouter les signataires</a>
              } @else {
                <button class="cta send" type="button" (click)="activateSignatures()" [disabled]="sending()">
                  {{ sending() ? 'Envoi…' : 'Envoyer pour signature' }}
                </button>
                <a class="cta" [routerLink]="['/app/documents', d.id, 'signers']">Modifier signataires</a>
                <a class="cta secondary" [routerLink]="['/app/documents', d.id, 'editor']">Éditeur</a>
              }
              <label class="ghost file-btn">
                Actualiser le fichier
                <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf" hidden (change)="onReplacePdf($event)" />
              </label>
            } @else {
              <button class="cta" type="button" (click)="reopenForEdit()" [disabled]="reopening()">
                {{ reopening() ? 'Ouverture…' : 'Modifier pour actualiser et resoumettre' }}
              </button>
            }
            <button class="ghost" type="button" (click)="openPdf()" [disabled]="openingPdf()">
              {{ openingPdf() ? 'Ouverture…' : 'Aperçu PDF' }}
            </button>
          </div>
        </div>

        @if (info()) { <div class="notice success">{{ info() }}</div> }

        @if (d.status === 'draft' && !(d.signers?.length)) {
          <div class="notice warn">
            Ce document est encore un brouillon sans signataires.
            Cliquez sur <strong>Ajouter les signataires</strong> pour continuer.
          </div>
        } @else if (d.status === 'draft') {
          <div class="notice warn">
            Le document est encore un brouillon : la signature n’est pas active.
            Cliquez sur <strong>Envoyer pour signature</strong> pour notifier uniquement le premier signataire par e-mail.
          </div>
        } @else if (d.status === 'completed') {
          <div class="notice success">
            Toutes les signatures sont collectées. Chaque signataire a reçu (ou va recevoir) le PDF final par e-mail.
          </div>
        } @else {
          <div class="notice">
            Le document a été envoyé. Seul le signataire dont c’est le tour reçoit un e-mail avec le lien de signature.
            Après sa signature, le suivant est notifié automatiquement.
            Quand tout le monde a signé, chacun reçoit le document final.
          </div>
        }

        <div class="grid">
          <section>
            <h3>Statut</h3>
            <p><strong>{{ statusLabel(d.status) }}</strong></p>
            <p>Hash : <code>{{ d.document_hash || d.signed_hash || d.original_hash || '—' }}</code></p>

            <h3>Signataires</h3>
            @for (s of d.signers || []; track s.id) {
              <div class="item">
                <strong>{{ s.first_name }} {{ s.last_name }}</strong>
                <small>{{ s.email }} · Ordre {{ s.signing_order }} · {{ s.role }} · {{ statusLabel(s.status || '') }}</small>
              </div>
            } @empty {
              <p class="empty">Aucun signataire pour le moment.</p>
              @if (d.status === 'draft') {
                <a class="sign-cta" [routerLink]="['/app/documents', d.id, 'signers']">Ajouter les signataires</a>
              }
            }
          </section>
          <section>
            <h3>Traçabilité</h3>
            @for (log of logs(); track log.id) {
              <div class="item">
                <strong>{{ log.event }}</strong>
                <small>{{ log.created_at | date:'medium' }} · IP {{ log.ip_address || '—' }}</small>
              </div>
            } @empty {
              <p>Aucun événement.</p>
            }
          </section>
        </div>
        @if (error()) { <p class="error">{{ error() }}</p> }
      </div>
    }
  `,
  styles: [`
    .head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;margin-bottom:1rem;}
    h2{margin:0;font-family:"Space Grotesk",sans-serif;color:#023A6C;}
    .actions{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;}
    .cta,.ghost{text-decoration:none;padding:.65rem .9rem;border-radius:.55rem;font-weight:600;font:inherit;cursor:pointer;}
    .cta{background:#0468B1;color:#fff;border:0;}
    .cta.send{background:#0f7b3a;}
    .cta.secondary{background:#023A6C;}
    .ghost{border:1px solid #0468B1;color:#0468B1;background:#fff;}
    .ghost:disabled,.cta:disabled{opacity:.6;cursor:not-allowed;}
    .file-btn{display:inline-flex;align-items:center;}
    .notice{background:#E8F3FA;border:1px solid #B6D4EA;color:#023A6C;padding:.85rem 1rem;border-radius:.7rem;margin-bottom:1rem;}
    .notice.warn{background:#fffbeb;border-color:#fde68a;color:#92400e;}
    .notice.success{background:#D6EAF8;border-color:#0468B1;color:#023A6C;}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;}
    section{background:rgba(255,255,255,.78);border:1px solid rgba(4,104,177,.12);border-radius:.9rem;padding:1rem;}
    .item{padding:.75rem 0;border-bottom:1px solid #e2e8f0;display:grid;gap:.35rem;}
    small{color:#64748b;}
    code{font-size:.78rem;word-break:break-all;}
    .empty{color:#64748b;}
    .sign-cta{
      display:inline-block;width:fit-content;background:#0468B1;color:#fff !important;
      text-decoration:none;padding:.55rem .85rem;border-radius:.5rem;font-weight:700;
    }
    .error{color:#b91c1c;}
    @media (max-width:860px){.grid{grid-template-columns:1fr;}.head{flex-direction:column;}}
  `],
})
export class DocumentDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly documents = inject(DocumentService);
  private readonly auth = inject(AuthService);

  readonly doc = signal<DocumentItem | null>(null);
  readonly logs = signal<AuditLog[]>([]);
  readonly openingPdf = signal(false);
  readonly reopening = signal(false);
  readonly sending = signal(false);
  readonly error = signal('');
  readonly info = signal('');
  private docId = 0;

  ngOnInit(): void {
    this.docId = Number(this.route.snapshot.paramMap.get('id'));
    this.reload();
  }

  reload() {
    this.documents.get(this.docId).subscribe((doc) => this.doc.set(doc));
    this.documents.audit(this.docId).subscribe({
      next: (logs) => this.logs.set(logs),
      error: () => this.logs.set([]),
    });
  }

  activateSignatures() {
    const d = this.doc();
    if (!d?.id) return;
    const signers = (d.signers || []).filter((s: Signer) => s.id && s.role !== 'observer');
    if (!signers.length) {
      this.error.set('Ajoutez au moins un signataire avant d’envoyer.');
      return;
    }

    this.sending.set(true);
    this.error.set('');
    this.info.set('');

    const existing = [...(d.fields || [])];
    const needsFields = !existing.some((f) => f.required);
    const fields: SignatureField[] = needsFields
      ? [
          ...existing,
          ...signers.map((s, i) => ({
            signer_id: Number(s.id),
            type: 'signature' as const,
            page: 1,
            x: 12,
            y: Math.max(8, 78 - i * 10),
            width: 28,
            height: 8,
            required: true,
            label: `Signature ${s.first_name}`,
          })),
        ]
      : existing;

    const send = () =>
      this.documents.send(d.id).subscribe({
        next: (doc) => {
          this.sending.set(false);
          this.doc.set(doc);
          this.router.navigate(['/app/documents'], { queryParams: { invited: '1' } });
        },
        error: (err) => {
          this.sending.set(false);
          this.error.set(err?.error?.message || 'Impossible d’envoyer le document');
        },
      });

    if (needsFields) {
      this.documents.syncFields(d.id, fields).subscribe({
        next: () => send(),
        error: (err) => {
          this.sending.set(false);
          this.error.set(err?.error?.message || 'Impossible de préparer les zones de signature');
        },
      });
    } else {
      send();
    }
  }

  reopenForEdit() {
    if (!confirm('Remettre ce document en brouillon pour le modifier et le renvoyer ? Les signatures en cours seront réinitialisées.')) {
      return;
    }
    this.reopening.set(true);
    this.error.set('');
    this.info.set('');
    this.documents.reopen(this.docId).subscribe({
      next: (doc) => {
        this.doc.set(doc);
        this.reopening.set(false);
        this.info.set('Document remis en brouillon. Vous pouvez actualiser le PDF, modifier les champs, puis renvoyer.');
        this.reload();
        this.router.navigate(['/app/documents', this.docId, 'editor']);
      },
      error: (err) => {
        this.reopening.set(false);
        this.error.set(err?.error?.message || 'Impossible de rouvrir le document');
      },
    });
  }

  onReplacePdf(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];
    if (!allowed.some((ext) => name.endsWith(ext))) {
      this.error.set('Formats acceptés : PDF, Word (.doc, .docx) et Excel (.xls, .xlsx).');
      return;
    }
    this.error.set('');
    this.info.set('Conversion / remplacement du fichier…');
    this.documents.replaceFile(this.docId, file).subscribe({
      next: (doc) => {
        this.doc.set(doc);
        this.info.set('Fichier actualisé (converti en PDF si besoin). Vous pouvez modifier les champs puis renvoyer.');
        this.reload();
      },
      error: (err) => {
        this.info.set('');
        this.error.set(err?.error?.message || 'Impossible de remplacer le fichier');
      },
    });
    (event.target as HTMLInputElement).value = '';
  }

  async openPdf() {
    this.openingPdf.set(true);
    this.error.set('');
    try {
      const token = this.auth.token();
      const res = await fetch(this.documents.fileUrl(this.docId), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch {
      this.error.set("Impossible d'ouvrir le PDF. Reconnectez-vous puis réessayez.");
    } finally {
      this.openingPdf.set(false);
    }
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      draft: 'Brouillon',
      sent: 'Envoyé',
      in_progress: 'En cours',
      completed: 'Signé',
      declined: 'Refusé',
      expired: 'Expiré',
      pending: 'En attente',
      notified: 'Notifié',
      viewed: 'Consulté',
      opened: 'Ouvert',
      signed: 'Signé',
      approved: 'Approuvé',
    };
    return map[status] || status;
  }
}
