import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { DocumentService } from '../core/document.service';

@Component({
  selector: 'app-document-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="page">
      <h1>Nouveau dossier</h1>
      <p class="sub">Etape {{ step }} / 2 — {{ step === 1 ? 'Document' : 'Signataires' }}</p>

      <form [formGroup]="form" (ngSubmit)="next()">
        <div class="card" *ngIf="step === 1">
          <label>Titre du document<input formControlName="title" /></label>
          <label>Description<textarea formControlName="description" rows="3"></textarea></label>
          <label>Date d'expiration<input type="datetime-local" formControlName="expires_at" /></label>
          <label>Fichier PDF
            <input type="file" accept="application/pdf" (change)="onFile($event)" />
          </label>
        </div>

        <div class="card" *ngIf="step === 2" formArrayName="signers">
          <div class="signer" *ngFor="let g of signers.controls; let i = index" [formGroupName]="i">
            <h3>Signataire {{ i + 1 }}</h3>
            <div class="grid">
              <label>Prenom<input formControlName="first_name" /></label>
              <label>Nom<input formControlName="last_name" /></label>
              <label>Email<input type="email" formControlName="email" /></label>
              <label>Ordre<input type="number" min="1" formControlName="signing_order" /></label>
              <label>Role
                <select formControlName="role">
                  <option value="signer">Signataire</option>
                  <option value="approver">Approbateur</option>
                  <option value="observer">Observateur</option>
                </select>
              </label>
            </div>
            <button type="button" class="ghost" *ngIf="signers.length > 1" (click)="removeSigner(i)">Retirer</button>
          </div>
          <button type="button" class="ghost" (click)="addSigner()">+ Ajouter un signataire</button>
        </div>

        <p class="error" *ngIf="error">{{ error }}</p>
        <div class="actions">
          <button type="button" class="ghost" *ngIf="step === 2" (click)="step = 1">Retour</button>
          <button type="submit" [disabled]="loading">{{ step === 1 ? 'Continuer' : 'Placer les champs' }}</button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    h1 { font-family: "Fraunces", Georgia, serif; color: #023A6C; margin-bottom: .25rem; }
    .sub { color: #64748b; }
    .card { background: #fff; border: 1px solid #d7e5e2; border-radius: 16px; padding: 1.2rem; display: grid; gap: .9rem; }
    label { display: grid; gap: .35rem; font-weight: 600; color: #023A6C; }
    input, textarea, select, button { font: inherit; border-radius: 10px; border: 1px solid #b7d4cf; padding: .7rem .85rem; }
    button { background: #0468B1; color: #fff; border-color: #0468B1; font-weight: 700; cursor: pointer; }
    .ghost { background: #fff; color: #0468B1; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: .8rem; }
    .signer { border-top: 1px solid #e2e8f0; padding-top: 1rem; }
    .signer:first-child { border-top: 0; padding-top: 0; }
    .actions { display: flex; gap: .8rem; margin-top: 1rem; }
    .error { color: #b91c1c; }
    @media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class DocumentCreateComponent {
  step = 1;
  loading = false;
  error = '';
  file: File | null = null;

  form = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    expires_at: [''],
    signers: this.fb.array([this.signerGroup(1)]),
  });

  constructor(
    private fb: FormBuilder,
    private documents: DocumentService,
    private router: Router
  ) {}

  get signers() {
    return this.form.get('signers') as FormArray;
  }

  signerGroup(order: number) {
    return this.fb.group({
      first_name: ['', Validators.required],
      last_name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      signing_order: [order, Validators.required],
      role: ['signer', Validators.required],
    });
  }

  addSigner() {
    this.signers.push(this.signerGroup(this.signers.length + 1));
  }

  removeSigner(index: number) {
    this.signers.removeAt(index);
  }

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0] || null;
  }

  next() {
    this.error = '';
    if (this.step === 1) {
      if (this.form.get('title')?.invalid || !this.file) {
        this.error = 'Titre et PDF obligatoires.';
        return;
      }
      this.step = 2;
      return;
    }

    if (this.signers.invalid || !this.file) {
      this.error = 'Completez les signataires.';
      return;
    }

    this.loading = true;
    const raw = this.form.getRawValue();
    const fd = new FormData();
    fd.append('title', raw.title || '');
    fd.append('description', raw.description || '');
    if (raw.expires_at) {
      fd.append('expires_at', new Date(raw.expires_at).toISOString());
    }
    fd.append('signers_count', String(this.signers.length));
    fd.append('file', this.file);

    this.documents.create(fd).subscribe({
      next: (doc) => {
        this.documents.syncSigners(doc.id, this.signers.getRawValue() as any[]).subscribe({
          next: () => {
            this.loading = false;
            this.router.navigate(['/app/documents', doc.id, 'editor']);
          },
          error: (err) => {
            this.loading = false;
            this.error = err?.error?.message || 'Erreur signataires';
          },
        });
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Erreur creation document';
      },
    });
  }
}
