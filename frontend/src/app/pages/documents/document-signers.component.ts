import { Component, OnInit, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DocumentItem, DocumentService } from '../../core/services/document.service';

@Component({
  selector: 'app-document-signers',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="page">
      <a class="back" [routerLink]="['/app/documents', docId]">← Retour au document</a>
      <h2>Ajouter les signataires</h2>
      <p class="sub">Document : {{ doc()?.title || ('#' + docId) }}. Un e-mail d’invitation est envoyé dès qu’un signataire est enregistré (Gmail, Outlook, Yahoo, etc.).</p>

      @if (!ready()) {
        <p class="info">Chargement des signataires…</p>
      } @else {
        <form class="card" [formGroup]="signersForm" (ngSubmit)="save()">
          <div formArrayName="signers">
            @for (g of signers.controls; track g; let i = $index) {
              <div class="signer" [formGroupName]="i">
                <h4>Signataire {{ i + 1 }}</h4>
                <div class="grid">
                  <label>Prénom
                    <input formControlName="first_name" autocomplete="given-name" />
                  </label>
                  <label>Nom
                    <input formControlName="last_name" autocomplete="family-name" />
                  </label>
                  <label>Email
                    <input type="email" formControlName="email" autocomplete="email" placeholder="gmail, outlook, yahoo…" />
                  </label>
                  <label>Ordre
                    <input type="number" min="1" formControlName="signing_order" />
                  </label>
                  <label>Rôle
                    <select formControlName="role">
                      <option value="signer">Signataire</option>
                      <option value="approver">Approbateur</option>
                      <option value="observer">Observateur</option>
                    </select>
                  </label>
                </div>
                @if (signers.length > 1) {
                  <button type="button" class="ghost danger" (click)="removeSigner(i)">Retirer</button>
                }
              </div>
            }
          </div>

          @if (error()) { <p class="error">{{ error() }}</p> }
          @if (info()) { <p class="info">{{ info() }} <a [routerLink]="['/app/documents', docId, 'editor']">Ouvrir l’éditeur</a></p> }

          <div class="actions">
            <button type="button" class="ghost" (click)="addSigner()">+ Ajouter un signataire</button>
            <button type="submit" class="primary" [disabled]="loading()">
              {{ loading() ? 'Enregistrement…' : 'Enregistrer et placer les champs' }}
            </button>
          </div>
        </form>
      }
    </div>
  `,
  styles: [`
    .back{color:#0468B1;text-decoration:none;font-weight:600;display:inline-block;margin-bottom:.6rem;}
    h2{margin:0;font-family:"Space Grotesk",sans-serif;color:#023A6C;}
    .sub{color:#64748b;}
    .card{background:rgba(255,255,255,.85);border:1px solid rgba(4,104,177,.12);border-radius:1rem;padding:1.2rem;display:grid;gap:.9rem;max-width:860px;}
    label{display:grid;gap:.3rem;color:#334155;font-weight:600;}
    input,select,button{font:inherit;border-radius:.55rem;border:1px solid #cbd5e1;padding:.65rem .8rem;}
    button{cursor:pointer;font-weight:600;}
    .primary{background:#0468B1;color:#fff;border-color:#0468B1;}
    .primary:disabled{opacity:.65;cursor:wait;}
    .ghost{background:#fff;color:#0468B1;}
    .danger{border-color:#fca5a5;color:#b91c1c;}
    .signer{border-top:1px solid #e2e8f0;padding-top:1rem;display:grid;gap:.7rem;}
    .signer:first-child{border-top:0;padding-top:0;}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem;}
    .actions{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
    .error{color:#b91c1c;margin:0;white-space:pre-line;}
    .info{color:#0468B1;margin:0;}
    @media (max-width:700px){.grid{grid-template-columns:1fr;}}
  `],
})
export class DocumentSignersComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly documents = inject(DocumentService);
  private readonly fb = inject(FormBuilder);

  readonly doc = signal<DocumentItem | null>(null);
  readonly ready = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly info = signal('');
  docId = 0;

  readonly signersForm = this.fb.group({
    signers: this.fb.array<FormGroup>([]),
  });

  get signers(): FormArray {
    return this.signersForm.get('signers') as FormArray;
  }

  ngOnInit(): void {
    this.docId = Number(this.route.snapshot.paramMap.get('id'));
    void import('./document-editor.component');
    this.documents.get(this.docId).subscribe({
      next: (doc) => {
        this.doc.set(doc);
        if (doc.status !== 'draft') {
          this.error.set('Les signataires ne peuvent être modifiés que sur un brouillon.');
          this.ready.set(true);
          return;
        }
        this.signers.clear();
        if (doc.signers?.length) {
          doc.signers.forEach((s, i) => {
            this.signers.push(this.createSigner(s.signing_order || i + 1, s));
          });
        } else {
          const count = Math.max(1, Number(doc.signers_count) || 1);
          for (let i = 1; i <= count; i++) {
            this.signers.push(this.createSigner(i));
          }
        }
        this.ready.set(true);
      },
      error: () => {
        this.error.set('Document introuvable.');
        this.ready.set(true);
      },
    });
  }

  addSigner() {
    this.signers.push(this.createSigner(this.signers.length + 1));
  }

  removeSigner(index: number) {
    this.signers.removeAt(index);
  }

  save() {
    this.error.set('');
    this.info.set('');
    this.trimSignerValues();
    this.signersForm.markAllAsTouched();
    this.signersForm.updateValueAndValidity({ emitEvent: false });

    if (!this.docId) {
      this.error.set('Identifiant du document manquant. Revenez à la liste Documents.');
      return;
    }

    if (this.signers.length === 0) {
      this.error.set('Ajoutez au moins un signataire.');
      return;
    }

    if (this.signersForm.invalid) {
      this.error.set(this.buildValidationMessage());
      return;
    }

    const payload = this.signers.getRawValue().map((s: any, index: number) => ({
      first_name: String(s.first_name || '').trim(),
      last_name: String(s.last_name || '').trim(),
      email: String(s.email || '').trim(),
      signing_order: Number(s.signing_order || index + 1),
      role: s.role || 'signer',
    }));

    this.loading.set(true);
    this.info.set('Enregistrement en cours…');

    this.documents.syncSigners(this.docId, payload).subscribe({
      next: (doc) => {
        this.loading.set(false);
        const sent = doc.invitations?.sent || [];
        const failed = doc.invitations?.failed || [];
        if (sent.length) {
          this.info.set('Invitation envoyée à ' + sent.join(', ') + '.');
        } else {
          this.info.set('Signataires enregistrés.');
        }
        if (failed.length) {
          this.error.set(
            'E-mail non envoyé (' +
              failed.join(', ') +
              '). ' +
              (doc.invitations?.error || 'Vérifiez MAIL_PASSWORD (mot de passe d’application Gmail).')
          );
        }
        void this.router.navigate(['/app/documents', this.docId, 'editor']);
      },
      error: (err) => {
        this.loading.set(false);
        this.info.set('');
        const errors = err?.error?.errors;
        if (errors) {
          this.error.set(
            Object.entries(errors)
              .map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`)
              .join('\n')
          );
          return;
        }
        const status = err?.status;
        if (status === 0 || status === 502 || status === 504) {
          this.error.set(
            'Le serveur a mis trop de temps (souvent SMTP). Rechargez la page : les signataires sont peut-être déjà enregistrés. Puis redéployez le dernier commit.'
          );
          return;
        }
        this.error.set(err?.error?.message || `Impossible d'enregistrer les signataires${status ? ' (HTTP ' + status + ')' : ''}`);
      },
    });
  }

  private trimSignerValues() {
    this.signers.controls.forEach((control) => {
      const group = control as FormGroup;
      ['first_name', 'last_name', 'email'].forEach((key) => {
        const c = group.get(key);
        if (!c) return;
        const value = String(c.value ?? '').trim();
        if (c.value !== value) c.setValue(value);
      });
    });
  }

  private buildValidationMessage(): string {
    const lines: string[] = [];
    this.signers.controls.forEach((group, i) => {
      const missing: string[] = [];
      if (group.get('first_name')?.invalid) missing.push('prénom');
      if (group.get('last_name')?.invalid) missing.push('nom');
      if (group.get('email')?.invalid) missing.push('email valide');
      if (group.get('signing_order')?.invalid) missing.push('ordre');
      if (group.get('role')?.invalid) missing.push('rôle');
      if (missing.length) {
        lines.push(`Signataire ${i + 1} : renseignez ${missing.join(', ')}.`);
      }
    });
    return lines.join('\n') || 'Formulaire incomplet.';
  }

  private createSigner(order: number, existing?: any) {
    return this.fb.group({
      first_name: [existing?.first_name || '', Validators.required],
      last_name: [existing?.last_name || '', Validators.required],
      email: [existing?.email || '', [Validators.required, Validators.email]],
      signing_order: [existing?.signing_order || order, [Validators.required, Validators.min(1)]],
      role: [existing?.role || 'signer', Validators.required],
    });
  }
}
