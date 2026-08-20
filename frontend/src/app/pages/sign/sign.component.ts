import { AfterViewInit, Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import SignaturePad from 'signature_pad';
import { DocumentService, SignatureField } from '../../core/services/document.service';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

@Component({
  selector: 'app-sign',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="sign-page">
      <header>
        <div>
          <div class="brand">Plateforme E-Signature</div>
          <h1>{{ title() }}</h1>
          <p>{{ signerName() }} · {{ role() }}</p>
        </div>
        <img class="pnud-logo" src="/pnud-logo.png" alt="PNUD" />
      </header>

      @if (message()) {
        <div class="banner success">{{ message() }}</div>
      }
      @if (!message()) {
        <div class="banner info">
          1) Préparez votre signature à droite ·
          2) Cliquez sur les cadres verts du PDF ·
          3) Cliquez sur <strong>Signer</strong>
        </div>
      }

      <div class="layout">
        <section class="doc">
          <div class="toolbar">
            <button type="button" (click)="prev()" [disabled]="page()<=1">◀</button>
            <span>Page {{ page() }} / {{ pageCount() || 1 }}</span>
            <button type="button" (click)="next()" [disabled]="page()>=pageCount()">▶</button>
          </div>

          <div class="canvas-wrap" #wrap>
            <canvas #canvas></canvas>
            @if (!pdfReady()) {
              <div class="overlay">{{ pdfMessage() || 'Chargement du document…' }}</div>
            }
            @for (f of fieldsOnPage(); track trackField(f)) {
              <div
                class="field"
                [class.filled]="isFilled(f)"
                [class.active]="activeFieldId() === f.id"
                [class.field-signature]="f.type === 'signature'"
                [class.field-initials]="f.type === 'initials'"
                [style.left.%]="f.x" [style.top.%]="f.y"
                [style.width.%]="f.width" [style.height.%]="f.height"
                (click)="applyToField(f)">
                @if (f.type === 'checkbox') {
                  <label class="check">
                    <input type="checkbox" [(ngModel)]="fieldValues[f.id!]" />
                    Case
                  </label>
                } @else if (f.type === 'text') {
                  <input [(ngModel)]="fieldValues[f.id!]" placeholder="Saisir un texte" (click)="$event.stopPropagation()" />
                } @else if (previewFor(f)) {
                  <span
                    class="preview-text"
                    [class.signature-text]="f.type === 'signature' || f.type === 'name'"
                    [class.initials-text]="f.type === 'initials'"
                    [style.fontFamily]="f.type === 'initials' ? initialsFont : signatureFont">
                    {{ previewFor(f) }}
                  </span>
                } @else {
                  <span class="placeholder">Cliquez pour {{ labelOf(f.type) }}</span>
                }
              </div>
            }
          </div>
          @if (!fields().length && pdfReady()) {
            <p class="warn">Aucun champ de signature n’a été placé pour vous sur ce document.</p>
          }
        </section>

        @if (canSign()) {
          <aside>
            <h3>Votre signature</h3>
            <p class="aside-tip">Choisissez une méthode, puis cliquez un cadre vert sur le PDF.</p>

            <div class="methods">
              <button type="button" [class.active]="method==='type'" (click)="method='type'; syncPreviews()">Taper</button>
              <button type="button" [class.active]="method==='draw'" (click)="method='draw'">Dessiner</button>
              <button type="button" [class.active]="method==='upload'" (click)="method='upload'">Importer</button>
            </div>

            @if (method === 'type') {
              <label>Prénom et nom
                <input [(ngModel)]="typedName" (ngModelChange)="syncPreviews()" />
              </label>
              <p class="preview-caption">Aperçu signature</p>
              <div class="live-preview" [style.fontFamily]="signatureFont">{{ typedName }}</div>
              <p class="preview-caption">Aperçu initiales</p>
              <div class="live-preview initials" [style.fontFamily]="initialsFont">{{ initialsOf(typedName) }}</div>
            }

            @if (method === 'draw') {
              <canvas #pad class="pad"></canvas>
              <div class="row">
                <button type="button" class="ghost" (click)="clearPad()">Effacer</button>
              </div>
            }

            @if (method === 'upload') {
              <input type="file" accept="image/*" (change)="onUpload($event)" />
              @if (uploadedDataUrl) {
                <img [src]="uploadedDataUrl" alt="signature" class="preview" />
              }
            }

            @if (error()) { <p class="error">{{ error() }}</p> }
            <button class="primary" type="button" (click)="sign()" [disabled]="loading()">Valider et signer</button>
            <button class="danger" type="button" (click)="decline()" [disabled]="loading()">Refuser de signer</button>
          </aside>
        } @else if (!message()) {
          <aside>
            <p>Vous ne pouvez pas signer pour le moment (ordre de signature, rôle observateur, ou déjà traité).</p>
          </aside>
        }
      </div>
    </div>
  `,
  styles: [`
    .sign-page{min-height:100vh;padding:1.2rem;background:linear-gradient(160deg,#F5F9FC,#e8eef3);}
    header{display:flex;gap:1rem;align-items:flex-start;justify-content:space-between;margin-bottom:1rem;}
    .brand{font-family:"Space Grotesk",sans-serif;font-weight:700;color:#0468B1;letter-spacing:.02em;margin-bottom:.35rem;}
    .pnud-logo{height:64px;width:auto;flex-shrink:0;object-fit:contain;}
    h1{margin:0;font-size:1.4rem;color:#023A6C;}
    .banner{padding:.8rem 1rem;border-radius:.6rem;margin-bottom:1rem;}
    .banner.info{background:#ecfeff;color:#155e75;}
    .banner.success{background:#D6EAF8;color:#023A6C;}
    .layout{display:grid;grid-template-columns:1fr 340px;gap:1rem;}
    .doc, aside{background:rgba(255,255,255,.9);border:1px solid rgba(4,104,177,.12);border-radius:.9rem;padding:1rem;}
    .toolbar{display:flex;justify-content:center;gap:.7rem;margin-bottom:.7rem;}
    .toolbar button{border:1px solid #cbd5e1;background:#fff;border-radius:.4rem;padding:.35rem .7rem;cursor:pointer;}
    .canvas-wrap{position:relative;border:1px solid #cbd5e1;min-height:360px;background:#f8fafc;}
    canvas{width:100%;display:block;}
    .overlay{position:absolute;inset:0;display:grid;place-items:center;background:rgba(248,250,252,.85);color:#475569;font-weight:600;}
    .field{
      position:absolute;border:2px dashed #0468B1;background:rgba(4,104,177,.10);
      display:grid;place-items:center;overflow:hidden;cursor:pointer;padding:.15rem;
    }
    .field.active{border-style:solid;box-shadow:0 0 0 3px rgba(4,104,177,.2);}
    .field.filled{background:rgba(255,255,255,.85);border-style:solid;}
    .field.field-signature.filled,
    .field.field-initials.filled{
      border:none;background:transparent;box-shadow:none;
    }
    .placeholder{font-size:.72rem;color:#0468B1;font-weight:700;text-align:center;}
    .preview-text{font-size:clamp(11px,1.8vw,18px);color:#111827;text-align:center;line-height:1.1;font-style:italic;}
    .preview-text.signature-text{font-style:italic;}
    .field input{width:92%;border:0;background:transparent;}
    .check{display:flex;align-items:center;gap:.35rem;font-size:.8rem;color:#023A6C;}
    .methods{display:grid;grid-template-columns:repeat(3,1fr);gap:.35rem;margin-bottom:.7rem;}
    .methods button{border:1px solid #cbd5e1;background:#fff;border-radius:.45rem;padding:.5rem;cursor:pointer;}
    .methods button.active{border-color:#0468B1;background:#E8F3FA;}
    .pad{width:100%;height:160px;border:1px dashed #94a3b8;border-radius:.5rem;touch-action:none;background:#fff;}
    .row{display:flex;justify-content:flex-end;margin:.5rem 0;}
    label{display:grid;gap:.3rem;margin-bottom:.7rem;}
    input{border:1px solid #cbd5e1;border-radius:.5rem;padding:.55rem;font:inherit;}
    .live-preview{
      min-height:48px;border:0;background:transparent;
      display:grid;place-items:center;font-size:1.25rem;font-style:italic;margin-bottom:.25rem;color:#111827;
    }
    .live-preview.initials{font-style:italic;font-size:1.05rem;font-weight:600;letter-spacing:-0.08em;}
    .preview-caption{margin:.55rem 0 .15rem;font-size:.78rem;color:#64748b;}
    .preview-text.initials-text{font-style:italic;font-weight:600;letter-spacing:-0.08em;font-size:clamp(10px,1.5vw,15px);}
    .preview{max-width:100%;margin-top:.5rem;background:#fff;}
    .aside-tip{font-size:.85rem;color:#64748b;margin-top:0;}
    .primary,.danger,.ghost{width:100%;border:0;border-radius:.55rem;padding:.75rem;margin-top:.45rem;cursor:pointer;font-weight:600;}
    .primary{background:#0468B1;color:#fff;}
    .danger{background:#fff;color:#b91c1c;border:1px solid #fca5a5;}
    .ghost{background:transparent;color:#0468B1;border:1px solid #0468B1;width:auto;}
    .error{color:#b91c1c;}
    .warn{color:#92400e;background:#fffbeb;padding:.7rem .8rem;border-radius:.5rem;margin-top:.7rem;}
    @media (max-width:900px){.layout{grid-template-columns:1fr;}}
  `],
})
export class SignComponent implements OnInit, AfterViewInit {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('wrap') wrapRef!: ElementRef<HTMLDivElement>;
  @ViewChild('pad') padRef?: ElementRef<HTMLCanvasElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly documents = inject(DocumentService);

  readonly title = signal('');
  readonly signerName = signal('');
  readonly role = signal('');
  readonly canSign = signal(false);
  readonly page = signal(1);
  readonly pageCount = signal(0);
  readonly fields = signal<SignatureField[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly pdfReady = signal(false);
  readonly pdfMessage = signal('');
  readonly activeFieldId = signal<number | null>(null);

  method: 'draw' | 'type' | 'upload' = 'type';
  typedName = '';
  readonly signatureFont = '"Segoe Script", "Brush Script MT", cursive';
  readonly initialsFont = 'Georgia, "Times New Roman", serif';
  uploadedDataUrl = '';
  fieldValues: Record<number, any> = {};
  fieldPreviews: Record<number, string> = {};

  private token = '';
  private pdfDoc: any = null;
  private pad?: SignaturePad;

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    this.documents.publicShow(this.token).subscribe({
      next: async (res) => {
        this.title.set(res.document.title);
        this.signerName.set(`${res.signer.first_name} ${res.signer.last_name}`);
        this.typedName = `${res.signer.first_name} ${res.signer.last_name}`;
        this.role.set(res.signer.role || res.role);
        this.canSign.set(!!res.can_sign);
        this.fields.set(res.fields || []);
        this.documents.publicView(this.token).subscribe({ error: () => undefined });
        await this.loadPdf();
        this.syncPreviews();
      },
      error: (err) => this.message.set(err?.error?.message || 'Lien invalide ou expiré'),
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.initPad(), 250);
  }

  fieldsOnPage() {
    return this.fields().filter((f) => f.page === this.page());
  }

  trackField(f: SignatureField) {
    return f.id ?? `${f.type}-${f.x}-${f.y}`;
  }

  labelOf(type: string): string {
    const map: Record<string, string> = {
      signature: 'signer',
      initials: 'initiales',
      name: 'le nom',
      date: 'la date',
      text: 'texte',
      checkbox: 'case',
    };
    return map[type] || type;
  }

  previewFor(f: SignatureField): string {
    return this.fieldPreviews[f.id!] || '';
  }

  initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.map((p) => p[0]?.toUpperCase() || '').join('') || 'YB';
  }

  isFilled(f: SignatureField): boolean {
    if (f.type === 'checkbox') return !!this.fieldValues[f.id!];
    if (f.type === 'text') return !!this.fieldValues[f.id!];
    return !!this.fieldPreviews[f.id!];
  }

  applyToField(f: SignatureField) {
    if (!this.canSign()) return;
    this.activeFieldId.set(f.id || null);

    if (f.type === 'checkbox' || f.type === 'text') return;

    if (f.type === 'date') {
      this.fieldPreviews[f.id!] = new Date().toLocaleDateString('fr-FR');
      return;
    }

    if (f.type === 'initials') {
      this.fieldPreviews[f.id!] = this.initialsOf(this.typedName);
      return;
    }

    // signature / name
    if (this.method === 'type') {
      this.fieldPreviews[f.id!] = this.typedName.trim();
    } else if (this.method === 'draw' && this.pad && !this.pad.isEmpty()) {
      this.fieldPreviews[f.id!] = this.typedName.trim() || 'Signature manuscrite';
    } else if (this.method === 'upload' && this.uploadedDataUrl) {
      this.fieldPreviews[f.id!] = this.typedName.trim() || 'Signature importée';
    } else {
      this.fieldPreviews[f.id!] = this.typedName.trim();
    }
  }

  syncPreviews() {
    for (const f of this.fields()) {
      if (!f.id) continue;
      if (['signature', 'name', 'initials'].includes(f.type) && this.fieldPreviews[f.id]) {
        if (f.type === 'initials') {
          this.fieldPreviews[f.id] = this.initialsOf(this.typedName);
        } else {
          this.fieldPreviews[f.id] = this.typedName.trim();
        }
      }
    }
  }

  async prev() {
    if (this.page() > 1) {
      this.page.update((p) => p - 1);
      await this.render();
    }
  }

  async next() {
    if (this.page() < this.pageCount()) {
      this.page.update((p) => p + 1);
      await this.render();
    }
  }

  clearPad() {
    this.pad?.clear();
  }

  onUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => (this.uploadedDataUrl = String(reader.result || ''));
    reader.readAsDataURL(file);
  }

  sign() {
    this.loading.set(true);
    this.error.set('');

    if (!this.typedName.trim() && this.method === 'type') {
      this.loading.set(false);
      this.error.set('Saisissez votre prénom et nom.');
      return;
    }

    // Appliquer automatiquement la signature tapée sur tous les cadres
    for (const f of this.fields()) {
      if (!this.isFilled(f)) {
        this.applyToField(f);
      }
      if (['signature', 'name', 'initials', 'date'].includes(f.type) && f.id) {
        this.fieldValues[f.id] = this.fieldPreviews[f.id] || this.typedName;
      }
    }

    const required = this.fields().filter((f) => f.required);
    for (const f of required) {
      if (f.type === 'checkbox' && !this.fieldValues[f.id!]) {
        this.loading.set(false);
        this.error.set('Cochez toutes les cases obligatoires sur le PDF.');
        return;
      }
      if (f.type === 'text' && !this.fieldValues[f.id!]) {
        this.loading.set(false);
        this.error.set('Remplissez tous les champs texte obligatoires sur le PDF.');
        return;
      }
    }

    let signature_image: string | undefined;
    if (this.method === 'draw') {
      if (this.pad && !this.pad.isEmpty()) {
        signature_image = this.pad.toDataURL('image/png');
      } else if (!this.typedName.trim()) {
        this.loading.set(false);
        this.error.set('Dessinez votre signature ou passez en mode Taper.');
        return;
      }
    } else if (this.method === 'upload') {
      if (!this.uploadedDataUrl) {
        this.loading.set(false);
        this.error.set('Importez une image de signature.');
        return;
      }
      signature_image = this.uploadedDataUrl;
    } else if (this.method === 'type') {
      signature_image = this.buildTypedSignatureImage(this.typedName);
    }

    this.documents.publicSign(this.token, {
      method: this.method,
      signature_image,
      typed_name: this.typedName,
      font_style: this.signatureFont,
      field_values: this.fieldValues,
    }).subscribe({
      next: (res: any) => {
        this.loading.set(false);
        this.canSign.set(false);
        const next = res?.next_signer;
        if (res?.document_status === 'completed') {
          this.message.set('Signature enregistrée. Le document est finalisé : tous les signataires recevront le PDF signé par e-mail.');
        } else if (next?.email) {
          this.message.set(
            `Signature enregistrée. Une notification va être envoyée à ${next.first_name} ${next.last_name} (${next.email}).`
          );
        } else {
          this.message.set('Signature enregistrée. Le signataire suivant va recevoir un e-mail.');
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Signature impossible');
      },
    });
  }

  private buildTypedSignatureImage(name: string): string {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111827';
    ctx.font = `italic 42px ${this.signatureFont}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.trim(), canvas.width / 2, canvas.height / 2);
    return canvas.toDataURL('image/png');
  }

  decline() {
    const reason = prompt('Motif du refus (optionnel)') || undefined;
    this.loading.set(true);
    this.documents.publicDecline(this.token, reason).subscribe({
      next: () => {
        this.loading.set(false);
        this.canSign.set(false);
        this.message.set('Vous avez refusé de signer ce document.');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Action impossible');
      },
    });
  }

  private initPad() {
    if (!this.padRef) return;
    const canvas = this.padRef.nativeElement;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext('2d');
    ctx?.scale(ratio, ratio);
    this.pad = new SignaturePad(canvas, { backgroundColor: 'rgb(255,255,255)' });
  }

  private async loadPdf() {
    try {
      this.pdfReady.set(false);
      const res = await fetch(this.documents.publicFileUrl(this.token));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();
      const data = new Uint8Array(buffer);
      this.pdfDoc = await pdfjsLib.getDocument({ data, disableWorker: true } as never).promise;
      this.pageCount.set(this.pdfDoc.numPages);
      await this.render();
      this.pdfReady.set(true);
      setTimeout(() => this.initPad(), 100);
    } catch {
      this.pdfMessage.set('Impossible de charger le PDF.');
    }
  }

  private async render() {
    if (!this.pdfDoc || !this.canvasRef) return;
    const page = await this.pdfDoc.getPage(this.page());
    const viewport = page.getViewport({ scale: 1.4 });
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  }
}
