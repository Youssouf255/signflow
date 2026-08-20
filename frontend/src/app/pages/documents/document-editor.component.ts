import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DocumentItem, DocumentService, SignatureField, Signer } from '../../core/services/document.service';
import { AuthService } from '../../core/services/auth.service';

type FieldType = SignatureField['type'];

@Component({
  selector: 'app-document-editor',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="editor">
      <aside class="left">
        <h3>CHAMPS</h3>
        <p class="tip">Glissez un champ sur le PDF, ou sélectionnez-le puis cliquez sur le document.</p>
        @for (t of fieldTypes; track t.type) {
          <button type="button" draggable="true"
            (dragstart)="onDragStart($event, t.type)"
            (click)="selectType(t.type)"
            [class.active]="selectedType() === t.type">
            <span>{{ t.icon }}</span> {{ t.label }}
          </button>
        }
        <label class="check">
          <input type="checkbox" [checked]="required()" (change)="required.set($any($event.target).checked)" />
          Champ obligatoire
        </label>
        @if (status()) { <p class="status">{{ status() }}</p> }
      </aside>

      <section class="center">
        <div class="toolbar">
          <button type="button" (click)="prevPage()" [disabled]="page() <= 1">◀</button>
          <span>Page {{ page() }} / {{ pageCount() || 1 }}</span>
          <button type="button" (click)="nextPage()" [disabled]="page() >= pageCount()">▶</button>
        </div>
        <div class="canvas-wrap" #wrap
          (click)="placeFieldAtEvent($event)"
          (dragover)="onDragOver($event)"
          (drop)="onDrop($event)">
          <canvas #canvas></canvas>
          @if (!pdfReady()) {
            <div class="overlay">{{ pdfMessage() || 'Chargement du PDF…' }}</div>
          }
          @for (f of fieldsOnPage(); track trackField($index, f); let i = $index) {
            <div class="field"
              [style.left.%]="f.x" [style.top.%]="f.y"
              [style.width.%]="f.width" [style.height.%]="f.height"
              [style.borderColor]="signerColor(f.signer_id)"
              [style.background]="signerColorBg(f.signer_id)"
              [style.color]="signerColor(f.signer_id)"
              (mousedown)="startMove($event, i)">
              {{ labelOf(f.type) }}
              <button type="button" class="remove" (click)="removeField(i); $event.stopPropagation()">×</button>
            </div>
          }
        </div>
        <p class="hint">
          Champ actif : <strong>{{ labelOf(selectedType()) }}</strong>
          · Signataire :
          <strong [style.color]="signerColor(selectedSigner()?.id)">{{ selectedSignerLabel() }}</strong>
        </p>
      </section>

      <aside class="right">
        <div class="right-head">
          <h3>SIGNATAIRES</h3>
          <button type="button" class="linkish" (click)="toggleEditSigners()">
            {{ editingSigners() ? 'Fermer' : 'Modifier noms' }}
          </button>
        </div>

        @if (!editingSigners()) {
          <p class="tip">Cliquez un signataire pour lui assigner les champs. Pour changer un nom, cliquez « Modifier noms ».</p>
          @for (s of signers(); track s.id; let i = $index) {
            <button type="button" class="signer"
              [class.active]="selectedSigner()?.id === s.id"
              [style.borderColor]="signerColorByIndex(i)"
              [style.background]="selectedSigner()?.id === s.id ? signerColorBgByIndex(i) : '#fff'"
              [style.boxShadow]="'inset 4px 0 0 ' + signerColorByIndex(i)"
              (click)="selectedSigner.set(s)">
              <span class="swatch" [style.background]="signerColorByIndex(i)"></span>
              <strong [style.color]="signerColorByIndex(i)">{{ s.first_name }} {{ s.last_name }}</strong>
              <small>{{ s.email }}</small>
              <small>Ordre {{ s.signing_order }} · {{ s.role }}</small>
            </button>
          } @empty {
            <p class="error">Aucun signataire.</p>
          }
        } @else {
          <form class="edit-form" [formGroup]="signersEditForm" (ngSubmit)="saveSignerNames()">
            <p class="tip">Modifiez puis cliquez « Enregistrer les noms ».</p>
            <div formArrayName="signers">
              @for (g of editSigners.controls; track $index; let i = $index) {
                <div class="edit-card" [formGroupName]="i">
                  <label>Prénom<input formControlName="first_name" /></label>
                  <label>Nom<input formControlName="last_name" /></label>
                  <label>Email<input type="email" formControlName="email" placeholder="ex.  nom@gmail.com" /></label>
                </div>
              }
            </div>
            <button class="save-names" type="submit" [disabled]="loading()">
              {{ loading() ? 'Enregistrement…' : 'Enregistrer les noms' }}
            </button>
          </form>
        }

        <a class="full-edit" [routerLink]="['/app/documents', docId, 'signers']">Ouvrir la page signataires</a>
        @if (error()) { <p class="error">{{ error() }}</p> }
        @if (saveOk()) { <p class="ok">{{ saveOk() }}</p> }
        <button class="send" type="button" (click)="saveAndSend()" [disabled]="loading() || !fields().length">Envoyer</button>
        <button class="ghost" type="button" (click)="saveOnly()" [disabled]="loading()">Enregistrer champs</button>
      </aside>
    </div>
  `,
  styles: [`
    .editor { display:grid; grid-template-columns:230px 1fr 260px; gap:1rem; min-height:70vh; }
    aside, .center { background:rgba(255,255,255,.85); border:1px solid rgba(4,104,177,.12); border-radius:.9rem; padding:1rem; }
    h3 { margin:0; font-family:"Space Grotesk",sans-serif; color:#023A6C; }
    .right-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:.6rem; gap:.5rem; }
    .linkish { border:0; background:transparent; color:#0468B1; font-weight:700; cursor:pointer; }
    .tip { font-size:.8rem; color:#64748b; margin:0 0 .8rem; line-height:1.35; }
    .left button, .signer {
      width:100%; text-align:left; border:1px solid #dbe3ea; background:#fff;
      border-radius:.55rem; padding:.7rem .75rem; margin-bottom:.45rem; cursor:pointer;
      display:flex; flex-direction:column; gap:.15rem; font:inherit;
    }
    .left button { flex-direction:row; align-items:center; gap:.45rem; cursor:grab; }
    .left button.active { border-color:#0468B1; background:#E8F3FA; }
    .signer { position:relative; padding-left:.9rem; }
    .signer .swatch {
      position:absolute; top:.7rem; right:.65rem; width:12px; height:12px;
      border-radius:999px; border:1px solid rgba(15,23,42,.15);
    }
    .check { display:flex; gap:.45rem; align-items:center; margin-top:.8rem; color:#334155; font-size:.9rem; }
    .status { margin-top:.8rem; font-size:.82rem; color:#0468B1; background:#E8F3FA; padding:.55rem .65rem; border-radius:.5rem; }
    .toolbar { display:flex; justify-content:center; align-items:center; gap:.8rem; margin-bottom:.7rem; }
    .toolbar button { border:1px solid #cbd5e1; background:#fff; border-radius:.4rem; padding:.35rem .7rem; cursor:pointer; }
    .canvas-wrap { position:relative; width:100%; max-width:760px; margin:0 auto; border:2px dashed #94a3b8; background:#f1f5f9; min-height:420px; cursor:crosshair; }
    .canvas-wrap.drag-over { border-color:#0468B1; background:#E8F3FA; }
    canvas { width:100%; display:block; }
    .overlay { position:absolute; inset:0; display:grid; place-items:center; color:#475569; font-weight:600; background:rgba(248,250,252,.85); }
    .field {
      position:absolute; border:2px solid #0468B1; background:rgba(4,104,177,.18); color:#023A6C;
      font-size:.72rem; display:grid; place-items:center; text-transform:uppercase;
      cursor:move; user-select:none; z-index:2; font-weight:700;
    }
    .field .remove { position:absolute; top:-10px; right:-10px; width:22px; height:22px; border-radius:50%; border:0; background:#b91c1c; color:#fff; cursor:pointer; }
    .hint { color:#64748b; font-size:.85rem; text-align:center; margin-top:.75rem; }
    .signer small { color:#64748b; }
    .edit-form { display:grid; gap:.5rem; }
    .edit-card { display:grid; gap:.35rem; border:1px solid #dbe3ea; border-radius:.55rem; padding:.65rem; margin-bottom:.45rem; background:#fff; }
    .edit-card label { display:grid; gap:.2rem; font-size:.78rem; color:#334155; }
    .edit-card input { border:1px solid #cbd5e1; border-radius:.4rem; padding:.45rem .55rem; font:inherit; }
    .save-names { width:100%; background:#0468B1; color:#fff; border:0; border-radius:.55rem; padding:.7rem; font-weight:700; cursor:pointer; }
    .full-edit { display:block; margin:.7rem 0; color:#0468B1; font-weight:600; font-size:.85rem; }
    .send { width:100%; margin-top:1rem; background:#0468B1; color:#fff; border:0; border-radius:.55rem; padding:.75rem; font-weight:700; cursor:pointer; }
    .ghost { width:100%; margin-top:.5rem; background:transparent; color:#0468B1; border:1px solid #0468B1; border-radius:.55rem; padding:.65rem; cursor:pointer; }
    .error { color:#b91c1c; font-size:.88rem; }
    .ok { color:#023A6C; background:#D6EAF8; padding:.55rem .65rem; border-radius:.45rem; font-size:.85rem; }
    @media (max-width:980px){ .editor{grid-template-columns:1fr;} }
  `],
})
export class DocumentEditorComponent implements OnInit {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('wrap', { static: true }) wrapRef!: ElementRef<HTMLDivElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly documents = inject(DocumentService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly fieldTypes: { type: FieldType; label: string; icon: string }[] = [
    { type: 'signature', label: 'Signature', icon: 'S' },
    { type: 'initials', label: 'Initiales', icon: 'A' },
    { type: 'name', label: 'Nom', icon: 'T' },
    { type: 'date', label: 'Date', icon: 'D' },
    { type: 'checkbox', label: 'Case à cocher', icon: 'C' },
    { type: 'text', label: 'Texte', icon: 'X' },
  ];

  readonly selectedType = signal<FieldType>('signature');
  readonly required = signal(true);
  readonly signers = signal<Signer[]>([]);
  readonly selectedSigner = signal<Signer | null>(null);
  readonly fields = signal<SignatureField[]>([]);
  readonly page = signal(1);
  readonly pageCount = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly saveOk = signal('');
  readonly status = signal('Sélectionnez un champ, puis déposez-le sur le PDF.');
  readonly pdfReady = signal(false);
  readonly pdfMessage = signal('');
  readonly editingSigners = signal(false);

  readonly signersEditForm = this.fb.group({
    signers: this.fb.array([]),
  });

  docId = 0;
  private pdfDoc: any = null;
  private draggingType: FieldType | null = null;
  private signerOrderById = new Map<number, number>();

  get editSigners(): FormArray {
    return this.signersEditForm.get('signers') as FormArray;
  }

  ngOnInit(): void {
    this.docId = Number(this.route.snapshot.paramMap.get('id'));
    this.reloadDocument();
  }

  toggleEditSigners() {
    this.error.set('');
    this.saveOk.set('');
    if (!this.editingSigners()) {
      this.editSigners.clear();
      this.signers().forEach((s) => {
        this.editSigners.push(
          this.fb.group({
            first_name: [s.first_name || '', Validators.required],
            last_name: [s.last_name || '', Validators.required],
            email: [s.email || '', [Validators.required, Validators.email]],
            signing_order: [s.signing_order || 1],
            role: [s.role || 'signer'],
          })
        );
      });
      this.editingSigners.set(true);
      return;
    }
    this.editingSigners.set(false);
  }

  saveSignerNames() {
    this.error.set('');
    this.saveOk.set('');
    this.signersEditForm.markAllAsTouched();

    if (this.signersEditForm.invalid) {
      this.error.set('Prénom, nom et email valide sont obligatoires.');
      return;
    }

    const payload = this.editSigners.getRawValue().map((s: any, index: number) => ({
      first_name: String(s.first_name || '').trim(),
      last_name: String(s.last_name || '').trim(),
      email: String(s.email || '').trim(),
      signing_order: Number(s.signing_order || index + 1),
      role: (s.role || 'signer') as Signer['role'],
    }));

    const fieldsBackup = this.fields().map((f) => ({
      ...f,
      _order: this.signerOrderById.get(Number(f.signer_id)) || 1,
    }));

    this.loading.set(true);
    this.documents.syncSigners(this.docId, payload).subscribe({
      next: (doc) => {
        const list = doc.signers || [];
        this.signers.set([...list]);
        this.selectedSigner.set(list[0] || null);
        this.signerOrderById = new Map(list.map((s) => [Number(s.id), Number(s.signing_order)]));

        const remapped: SignatureField[] = fieldsBackup.map((f: any) => {
          const target = list.find((s) => Number(s.signing_order) === Number(f._order)) || list[0];
          return {
            type: f.type,
            page: f.page,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            required: !!f.required,
            label: f.label,
            signer_id: Number(target?.id),
          };
        });

        const finish = (fields: SignatureField[]) => {
          this.fields.set(fields);
          this.loading.set(false);
          this.editingSigners.set(false);
          this.saveOk.set(this.signersSavedMessage(list));
          this.status.set(this.signersSavedMessage(list));
        };

        if (!remapped.length) {
          finish([]);
          return;
        }

        this.documents.syncFields(this.docId, remapped).subscribe({
          next: (updated) => finish(updated.fields || remapped),
          error: () => finish(remapped),
        });
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Impossible de modifier les signataires');
      },
    });
  }

  private readonly signerPalette = [
    '#0468B1',
    '#C2410C',
    '#15803D',
    '#7C3AED',
    '#BE123C',
    '#0F766E',
    '#B45309',
    '#1D4ED8',
  ];

  selectType(type: FieldType) {
    this.selectedType.set(type);
    this.status.set(`Champ « ${this.labelOf(type)} » prêt.`);
  }

  selectedSignerLabel(): string {
    const s = this.selectedSigner();
    return s ? `${s.first_name} ${s.last_name}` : 'aucun';
  }

  signerColorByIndex(index: number): string {
    return this.signerPalette[index % this.signerPalette.length];
  }

  signerColorBgByIndex(index: number): string {
    return this.hexToRgba(this.signerColorByIndex(index), 0.14);
  }

  signerColor(signerId?: number | null): string {
    const index = this.signerIndex(signerId);
    return this.signerColorByIndex(index < 0 ? 0 : index);
  }

  signerColorBg(signerId?: number | null): string {
    return this.hexToRgba(this.signerColor(signerId), 0.18);
  }

  private signerIndex(signerId?: number | null): number {
    if (signerId == null) return -1;
    return this.signers().findIndex((s) => Number(s.id) === Number(signerId));
  }

  private hexToRgba(hex: string, alpha: number): string {
    const raw = hex.replace('#', '');
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  labelOf(type: FieldType): string {
    return this.fieldTypes.find((t) => t.type === type)?.label || type;
  }

  fieldsOnPage() {
    return this.fields().filter((f) => f.page === this.page());
  }

  trackField(index: number, f: SignatureField) {
    return `${f.page}-${f.type}-${f.x}-${f.y}-${index}`;
  }

  onDragStart(event: DragEvent, type: FieldType) {
    this.draggingType = type;
    this.selectedType.set(type);
    event.dataTransfer?.setData('text/plain', type);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.wrapRef.nativeElement.classList.add('drag-over');
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.wrapRef.nativeElement.classList.remove('drag-over');
    const type = (event.dataTransfer?.getData('text/plain') as FieldType) || this.draggingType || this.selectedType();
    this.placeAt(event.clientX, event.clientY, type);
    this.draggingType = null;
  }

  placeFieldAtEvent(event: MouseEvent) {
    if ((event.target as HTMLElement).closest('.field')) return;
    this.placeAt(event.clientX, event.clientY, this.selectedType());
  }

  startMove(event: MouseEvent, indexOnPage: number) {
    event.preventDefault();
    event.stopPropagation();
    const onPage = this.fieldsOnPage();
    const field = onPage[indexOnPage];
    if (!field) return;

    const move = (e: MouseEvent) => {
      const pos = this.percentFromPoint(e.clientX, e.clientY);
      field.x = Math.max(0, Math.min(100 - field.width, pos.x - field.width / 2));
      field.y = Math.max(0, Math.min(100 - field.height, pos.y - field.height / 2));
      this.fields.update((list) => [...list]);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  async prevPage() {
    if (this.page() > 1) {
      this.page.update((p) => p - 1);
      await this.renderPage();
    }
  }

  async nextPage() {
    if (this.page() < this.pageCount()) {
      this.page.update((p) => p + 1);
      await this.renderPage();
    }
  }

  removeField(indexOnPage: number) {
    const target = this.fieldsOnPage()[indexOnPage];
    this.fields.update((list) => list.filter((f) => f !== target));
  }

  saveOnly() { this.persist(false); }
  saveAndSend() { this.persist(true); }

  private reloadDocument() {
    this.documents.get(this.docId).subscribe({
      next: async (doc) => {
        const list = doc.signers || [];
        this.signers.set(list);
        this.selectedSigner.set(list[0] || null);
        this.fields.set(doc.fields || []);
        this.signerOrderById = new Map(list.map((s) => [Number(s.id), Number(s.signing_order)]));
        if (!list.length) this.error.set("Ajoutez d'abord des signataires.");
        await this.loadPdf(doc);
      },
      error: () => this.pdfMessage.set('Impossible de charger le document.'),
    });
  }

  private placeAt(clientX: number, clientY: number, type: FieldType) {
    const signer = this.selectedSigner();
    if (!signer?.id) {
      this.error.set('Sélectionnez un signataire à droite.');
      return;
    }
    if (!this.pdfReady()) {
      this.error.set('Attendez le chargement du PDF.');
      return;
    }
    const defaults: Record<FieldType, { width: number; height: number }> = {
      signature: { width: 28, height: 8 },
      initials: { width: 12, height: 6 },
      name: { width: 24, height: 5 },
      date: { width: 16, height: 5 },
      text: { width: 22, height: 5 },
      checkbox: { width: 4, height: 4 },
    };
    const size = defaults[type];
    const pos = this.percentFromPoint(clientX, clientY);
    this.fields.update((list) => [
      ...list,
      {
        signer_id: Number(signer.id),
        type,
        page: this.page(),
        x: Math.max(0, Math.min(100 - size.width, pos.x - size.width / 2)),
        y: Math.max(0, Math.min(100 - size.height, pos.y - size.height / 2)),
        width: size.width,
        height: size.height,
        required: this.required(),
      },
    ]);
    this.error.set('');
    this.status.set(`Champ « ${this.labelOf(type)} » placé pour ${signer.first_name}.`);
  }

  private percentFromPoint(clientX: number, clientY: number) {
    const rect = this.wrapRef.nativeElement.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  }

  private persist(send: boolean) {
    if (!this.fields().length && send) {
      this.error.set("Placez au moins un champ avant l'envoi.");
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.documents.syncFields(this.docId, this.fields()).subscribe({
      next: () => {
        if (!send) {
          this.loading.set(false);
          this.status.set('Champs enregistrés.');
          return;
        }
        this.documents.send(this.docId).subscribe({
          next: (doc) => {
            this.loading.set(false);
            const sent = (doc.invitations?.to || doc.invitations?.sent || []).join(',');
            const failed = (doc.invitations?.failed || []).join(',');
            this.router.navigate(['/app/documents'], {
              queryParams: { invited: '1', to: sent, failed },
            });
          },
          error: (err) => {
            this.loading.set(false);
            this.error.set(err?.error?.message || 'Envoi impossible');
          },
        });
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Enregistrement impossible');
      },
    });
  }

  private signersSavedMessage(list: Signer[]): string {
    return 'Signataires enregistrés : ' + list.map((s) => `${s.first_name} ${s.last_name}`).join(', ')
      + '. Cliquez Envoyer pour notifier le premier signataire.';
  }

  private async loadPdf(doc: DocumentItem) {
    try {
      this.pdfReady.set(false);
      this.pdfMessage.set('Chargement du PDF…');
      const token = this.auth.token();
      const res = await fetch(this.documents.fileUrl(doc.id), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();
      const data = new Uint8Array(buffer);
      const head = new TextDecoder('latin1').decode(data.slice(0, 5));
      if (head !== '%PDF-') {
        throw new Error('Réponse invalide (pas un PDF)');
      }
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      this.pdfDoc = await pdfjsLib.getDocument({ data, disableWorker: true } as never).promise;
      this.pageCount.set(this.pdfDoc.numPages);
      this.page.set(1);
      await this.renderPage();
      this.pdfReady.set(true);
      this.pdfMessage.set('');
      this.status.set('PDF prêt. Glissez un champ depuis la gauche.');
    } catch (err) {
      this.pdfReady.set(false);
      const detail = err instanceof Error ? err.message : '';
      this.pdfMessage.set(detail ? `Échec du chargement PDF (${detail}).` : 'Échec du chargement PDF.');
      this.error.set("Impossible d'afficher le PDF.");
    }
  }

  private async renderPage() {
    if (!this.pdfDoc) return;
    const page = await this.pdfDoc.getPage(this.page());
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  }
}
