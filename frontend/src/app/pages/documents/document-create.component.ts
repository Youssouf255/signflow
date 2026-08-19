import { Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { DocumentService } from '../../core/services/document.service';

@Component({
  selector: 'app-document-create',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="page">
      <h2>Créer un dossier</h2>
      <p class="sub">Étape {{ step() }} / 3</p>

      @if (step() === 1) {
        <form class="card" [formGroup]="metaForm" (ngSubmit)="nextFromMeta()">
          <label>Titre du document<input formControlName="title" /></label>
          <label>Description<textarea formControlName="description" rows="3"></textarea></label>
          <label>Nombre de signataires<input type="number" min="1" formControlName="signers_count" /></label>
          <label>
            Fichier (PDF, Word ou Excel)
            <input type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              (change)="onFile($event)" />
          </label>
          <p class="hint">Word et Excel sont convertis automatiquement en PDF pour la signature et le document final.</p>
          @if (fileName()) {
            <p class="file-name">Fichier sélectionné : {{ fileName() }}</p>
          }
          @if (loading()) {
            <p class="file-name">Conversion en PDF en cours…</p>
          }
          @if (error()) { <p class="error">{{ error() }}</p> }
          <button type="submit" [disabled]="metaForm.invalid || !file || loading()">Continuer</button>
        </form>
      }

      @if (step() === 2) {
        <form class="card" [formGroup]="signersForm" (ngSubmit)="saveSigners()">
          <div formArrayName="signers">
            @for (g of signers.controls; track $index; let i = $index) {
              <div class="signer" [formGroupName]="i">
                <h4>Signataire {{ i + 1 }}</h4>
                <div class="grid">
                  <label>Prénom<input formControlName="first_name" /></label>
                  <label>Nom<input formControlName="last_name" /></label>
                  <label>Email<input type="email" formControlName="email" placeholder="gmail, outlook, yahoo…" /></label>
                  <label>Ordre<input type="number" min="1" formControlName="signing_order" /></label>
                  <label>Rôle
                    <select formControlName="role">
                      <option value="signer">Signataire</option>
                      <option value="approver">Approbateur</option>
                      <option value="observer">Observateur</option>
                    </select>
                  </label>
                </div>
              </div>
            }
          </div>
          @if (error()) { <p class="error">{{ error() }}</p> }
          <div class="actions">
            <button type="button" class="ghost" (click)="addSigner()">+ Ajouter</button>
            <button type="submit" [disabled]="signersForm.invalid || loading()">Placer les champs</button>
          </div>
        </form>
      }
    </div>
  `,
  styles: [`
    h2 { margin:0; font-family:"Space Grotesk",sans-serif; color:#023A6C; }
    .sub { color:#64748b; }
    .card { background:rgba(255,255,255,.8); border:1px solid rgba(4,104,177,.12); border-radius:1rem; padding:1.2rem; display:grid; gap:.85rem; max-width:820px; }
    label { display:grid; gap:.3rem; color:#334155; }
    input, textarea, select { border:1px solid #cbd5e1; border-radius:.55rem; padding:.65rem .8rem; font:inherit; }
    button { background:#0468B1; color:#fff; border:0; border-radius:.55rem; padding:.75rem 1rem; font-weight:600; cursor:pointer; }
    .ghost { background:transparent; color:#0468B1; border:1px solid #0468B1; }
    .signer { border-top:1px solid #e2e8f0; padding-top:1rem; }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.7rem; }
    .actions { display:flex; justify-content:space-between; gap:1rem; }
    .error { color:#b91c1c; margin:0; white-space:pre-line; }
    .file-name { margin:0; color:#0468B1; font-size:.9rem; }
    .hint { margin:.35rem 0 0; color:#5b6b7c; font-size:.82rem; }
    @media (max-width:700px){ .grid{grid-template-columns:1fr;} }
  `],
})
export class DocumentCreateComponent {
  private readonly fb = inject(FormBuilder);
  private readonly documents = inject(DocumentService);
  private readonly router = inject(Router);

  readonly step = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly fileName = signal('');
  file: File | null = null;
  documentId: number | null = null;

  readonly metaForm = this.fb.nonNullable.group({
    title: ['', Validators.required],
    description: [''],
    signers_count: [1, [Validators.required, Validators.min(1)]],
  });

  readonly signersForm = this.fb.group({
    signers: this.fb.array([this.createSigner(1)]),
  });

  get signers(): FormArray {
    return this.signersForm.get('signers') as FormArray;
  }

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const selected = input.files?.[0] || null;
    this.error.set('');

    if (!selected) {
      this.file = null;
      this.fileName.set('');
      return;
    }

    const name = selected.name.toLowerCase();
    const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];
    const ok = allowed.some((ext) => name.endsWith(ext));

    if (!ok) {
      this.file = null;
      this.fileName.set('');
      input.value = '';
      this.error.set('Formats acceptés : PDF, Word (.doc, .docx) et Excel (.xls, .xlsx).');
      return;
    }

    this.file = selected;
    this.fileName.set(selected.name);
  }

  nextFromMeta() {
    if (this.metaForm.invalid || !this.file) return;

    const v = this.metaForm.getRawValue();

    this.loading.set(true);
    this.error.set('');
    const fd = new FormData();
    fd.append('title', v.title);
    if (v.description) fd.append('description', v.description);
    fd.append('signers_count', String(v.signers_count));
    fd.append('file', this.file);

    this.documents.create(fd).subscribe({
      next: (doc) => {
        const id = Number((doc as any)?.id ?? (doc as any)?.data?.id);
        this.loading.set(false);
        if (!id) {
          this.error.set('Document créé, mais identifiant introuvable. Ouvrez-le depuis Documents.');
          return;
        }
        this.documentId = id;
        // Page dédiée persistante (évite la perte de l'étape 2)
        this.router.navigate(['/app/documents', id, 'signers']);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(this.formatApiError(err));
      },
    });
  }

  addSigner() {
    this.signers.push(this.createSigner(this.signers.length + 1));
  }

  saveSigners() {
    if (!this.documentId || this.signersForm.invalid) return;
    this.loading.set(true);
    this.error.set('');
    this.documents.syncSigners(this.documentId, this.signers.getRawValue() as any).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/app/documents', this.documentId, 'editor']);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(this.formatApiError(err, 'Erreur signataires'));
      },
    });
  }

  private createSigner(order: number) {
    return this.fb.nonNullable.group({
      first_name: ['', Validators.required],
      last_name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      signing_order: [order, Validators.required],
      role: ['signer' as const, Validators.required],
    });
  }

  private formatApiError(err: any, fallback = 'Upload impossible'): string {
    const errors = err?.error?.errors as Record<string, string[]> | undefined;
    if (errors) {
      const labels: Record<string, string> = {
        file: 'Fichier',
        title: 'Titre',
        signers_count: 'Nombre de signataires',
        description: 'Description',
      };
      const messages: Record<string, string> = {
        'validation.mimes': 'formats acceptés : PDF, Word ou Excel',
        'validation.uploaded': 'échec du téléversement du fichier',
        'validation.after': 'doit être une date future',
        'validation.date': 'doit être une date valide',
        'validation.required': 'est obligatoire',
        'validation.max.file': 'ne doit pas dépasser 20 Mo',
      };

      return Object.entries(errors)
        .map(([field, msgs]) => {
          const label = labels[field] || field;
          const detail = (msgs || [])
            .map((m) => messages[m] || m)
            .join(', ');
          return `${label} : ${detail}`;
        })
        .join('\n');
    }

    const message = err?.error?.message as string | undefined;
    if (message?.includes('validation.mimes') || message?.includes('mimes')) {
      return 'Formats acceptés : PDF, Word (.doc, .docx) et Excel (.xls, .xlsx).';
    }
    if (message?.includes('validation.after')) {
      return "La date d'expiration doit être dans le futur (ou laissez vide).";
    }
    if (err?.status === 0) {
      return 'Le serveur n’a pas répondu. Réessayez, la conversion PDF peut prendre une minute.';
    }
    if (err?.status === 500 || err?.status === 504) {
      return 'La conversion Word/Excel vers PDF a échoué (délai dépassé). Réessayez.';
    }
    return message || fallback;
  }
}
