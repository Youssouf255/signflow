import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { DocumentService } from '../core/document.service';
import { DocItem, FieldType, SignatureField, Signer } from '../core/models';

@Component({
  selector: 'app-document-editor',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="editor" *ngIf="doc">
      <aside class="panel left">
        <h2>CHAMPS</h2>
        <button type="button" *ngFor="let t of fieldTypes" (click)="selectType(t.type)" [class.active]="selectedType === t.type">
          <span>{{ t.icon }}</span> {{ t.label }}
        </button>
        <label class="check">
          <input type="checkbox" [checked]="required" (change)="required = !required" /> Champ obligatoire
        </label>
      </aside>

      <main class="canvas-wrap">
        <div class="toolbar">
          <button type="button" (click)="prevPage()" [disabled]="page <= 1">Page -</button>
          <span>Page {{ page }} / {{ pageCount || '?' }}</span>
          <button type="button" (click)="nextPage()" [disabled]="page >= pageCount">Page +</button>
        </div>
        <div class="canvas" #canvas (click)="placeField($event)">
          <iframe *ngIf="pdfUrl" [src]="pdfUrl" title="PDF"></iframe>
          <div
            class="field"
            *ngFor="let f of fieldsOnPage"
            [style.left.%]="f.x"
            [style.top.%]="f.y"
            [style.width.%]="f.width"
            [style.height.%]="f.height"
            (click)="$event.stopPropagation(); removeField(f)"
            title="Cliquer pour supprimer"
          >
            {{ f.type }}
          </div>
        </div>
      </main>

      <aside class="panel right">
        <h2>SIGNATAIRES</h2>
        <button
          type="button"
          class="signer"
          *ngFor="let s of doc.signers"
          [class.active]="selectedSigner?.id === s.id"
          (click)="selectedSigner = s"
        >
          <strong>{{ s.first_name }} {{ s.last_name }}</strong>
          <small>{{ s.email }}</small>
          <small>Ordre {{ s.signing_order }} · {{ s.role }}</small>
        </button>
        <p class="error" *ngIf="error">{{ error }}</p>
        <button type="button" class="send" (click)="saveAndSend()" [disabled]="loading">Envoyer</button>
        <button type="button" class="ghost" (click)="saveOnly()" [disabled]="loading">Enregistrer</button>
      </aside>
    </div>
  `,
  styles: [`
    .editor {
      display: grid; grid-template-columns: 220px 1fr 260px; gap: 1rem; min-height: calc(100vh - 140px);
    }
    .panel {
      background: #fff; border: 1px solid #d7e5e2; border-radius: 16px; padding: 1rem;
      display: flex; flex-direction: column; gap: .55rem;
    }
    h2 { margin: 0 0 .5rem; font-size: .95rem; letter-spacing: .08em; color: #023A6C; }
    .panel button {
      border: 1px solid #d7e5e2; background: #f8fafc; border-radius: 10px; padding: .7rem;
      text-align: left; cursor: pointer; font: inherit;
    }
    .panel button.active { border-color: #0468B1; background: #ecfeff; color: #0468B1; font-weight: 700; }
    .signer { display: grid; gap: .15rem; }
    .signer small { color: #64748b; }
    .send { background: #0468B1 !important; color: #fff !important; border-color: #0468B1 !important; font-weight: 700; margin-top: auto; }
    .ghost { background: #fff !important; }
    .canvas-wrap { display: flex; flex-direction: column; gap: .6rem; }
    .toolbar { display: flex; gap: .6rem; align-items: center; }
    .toolbar button { border: 1px solid #b7d4cf; background: #fff; border-radius: 8px; padding: .4rem .7rem; cursor: pointer; }
    .canvas {
      position: relative; flex: 1; min-height: 70vh; background: #cbd5e1;
      border-radius: 12px; overflow: hidden; border: 1px solid #94a3b8;
    }
    iframe { width: 100%; height: 100%; border: 0; background: #fff; pointer-events: none; }
    .field {
      position: absolute; border: 2px dashed #0468B1; background: rgba(20,184,166,.2);
      color: #023A6C; font-size: .75rem; font-weight: 700; display: grid; place-items: center; cursor: pointer;
    }
    .check { display: flex; gap: .4rem; align-items: center; color: #334155; font-size: .9rem; }
    .error { color: #b91c1c; font-size: .85rem; }
    @media (max-width: 1000px) {
      .editor { grid-template-columns: 1fr; }
    }
  `],
})
export class DocumentEditorComponent implements OnInit {
  doc: DocItem | null = null;
  fields: SignatureField[] = [];
  selectedSigner: Signer | null = null;
  selectedType: FieldType = 'signature';
  required = true;
  page = 1;
  pageCount = 1;
  pdfUrl: SafeResourceUrl | null = null;
  loading = false;
  error = '';

  fieldTypes: { type: FieldType; label: string; icon: string }[] = [
    { type: 'signature', label: 'Signature', icon: 'âœ' },
    { type: 'initials', label: 'Initiales', icon: 'A' },
    { type: 'name', label: 'Nom', icon: 'T' },
    { type: 'date', label: 'Date', icon: 'ðŸ“…' },
    { type: 'checkbox', label: 'Case a cocher', icon: '☑' },
    { type: 'text', label: 'Texte', icon: 'ðŸ“' },
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private documents: DocumentService,
    private http: HttpClient,
    private sanitizer: DomSanitizer
  ) {}

  get fieldsOnPage() {
    return this.fields.filter((f) => f.page === this.page);
  }

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.documents.get(id).subscribe((doc) => {
      this.doc = doc;
      this.selectedSigner = doc.signers?.[0] || null;
      this.fields = (doc.fields || []).map((f) => ({ ...f, _localId: crypto.randomUUID() }));
      this.loadPdf(id);
    });
  }

  loadPdf(id: number) {
    this.http.get(this.documents.fileUrl(id), { responseType: 'blob' }).subscribe((blob) => {
      this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(URL.createObjectURL(blob));
    });
  }

  selectType(type: FieldType) {
    this.selectedType = type;
  }

  placeField(event: MouseEvent) {
    if (!this.selectedSigner || !this.doc) {
      this.error = 'Selectionnez un signataire.';
      return;
    }
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    const defaults: Record<FieldType, { width: number; height: number }> = {
      signature: { width: 22, height: 8 },
      initials: { width: 10, height: 6 },
      name: { width: 20, height: 5 },
      date: { width: 16, height: 5 },
      text: { width: 22, height: 5 },
      checkbox: { width: 4, height: 4 },
    };

    const size = defaults[this.selectedType];
    this.fields = [
      ...this.fields,
      {
        _localId: crypto.randomUUID(),
        signer_id: this.selectedSigner.id,
        type: this.selectedType,
        page: this.page,
        x: Math.max(0, Math.min(100 - size.width, x - size.width / 2)),
        y: Math.max(0, Math.min(100 - size.height, y - size.height / 2)),
        width: size.width,
        height: size.height,
        required: this.required,
        label: this.selectedType,
      },
    ];
    this.error = '';
  }

  removeField(field: SignatureField) {
    this.fields = this.fields.filter((f) => f._localId !== field._localId);
  }

  prevPage() {
    this.page = Math.max(1, this.page - 1);
  }

  nextPage() {
    this.page = Math.min(this.pageCount, this.page + 1);
  }

  private payload() {
    return this.fields.map(({ signer_id, type, page, x, y, width, height, required, label }) => ({
      signer_id, type, page, x, y, width, height, required, label,
    }));
  }

  saveOnly() {
    if (!this.doc) return;
    this.loading = true;
    this.documents.syncFields(this.doc.id, this.payload() as SignatureField[]).subscribe({
      next: () => {
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Erreur enregistrement';
      },
    });
  }

  saveAndSend() {
    if (!this.doc) return;
    if (!this.fields.length) {
      this.error = 'Placez au moins un champ.';
      return;
    }
    this.loading = true;
    this.documents.syncFields(this.doc.id, this.payload() as SignatureField[]).subscribe({
      next: () => {
        this.documents.send(this.doc!.id).subscribe({
          next: () => {
            this.loading = false;
            this.router.navigate(['/app/documents', this.doc!.id]);
          },
          error: (err) => {
            this.loading = false;
            this.error = err?.error?.message || err?.error?.error || 'Envoi impossible';
          },
        });
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Erreur champs';
      },
    });
  }
}
