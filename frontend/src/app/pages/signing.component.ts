import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { SigningService, SigningSession } from '../core/signing.service';

@Component({
  selector: 'app-signing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page" *ngIf="session">
      <header>
        <div>
          <p class="eyebrow">Plateforme E-Signature</p>
          <h1>{{ session.document.title }}</h1>
          <p>{{ session.document.reference }} · {{ session.signer.first_name }} {{ session.signer.last_name }}</p>
        </div>
        <div class="meta">
          <span [class.ok]="session.can_sign">{{ session.can_sign ? 'A votre tour' : 'Consultation' }}</span>
        </div>
      </header>

      <div class="layout">
        <section class="pdf card">
          <iframe *ngIf="pdfUrl" [src]="pdfUrl" title="Document"></iframe>
        </section>

        <section class="actions card">
          <h2>Champs</h2>
          <div class="field" *ngFor="let f of session.fields">
            <label>
              {{ f.type }} <small *ngIf="f.required">*</small>
              <ng-container [ngSwitch]="f.type">
                <input *ngSwitchCase="'text'" [(ngModel)]="fieldValues[f.id!]" />
                <input *ngSwitchCase="'name'" [(ngModel)]="fieldValues[f.id!]" />
                <input *ngSwitchCase="'date'" type="datetime-local" [(ngModel)]="fieldValues[f.id!]" />
                <input *ngSwitchCase="'checkbox'" type="checkbox" [(ngModel)]="fieldValues[f.id!]" />
                <span *ngSwitchDefault>Sera rempli par la signature</span>
              </ng-container>
            </label>
          </div>

          <div *ngIf="session.can_sign">
            <h2>Signature</h2>
            <div class="tabs">
              <button type="button" [class.active]="method==='draw'" (click)="method='draw'">Dessiner</button>
              <button type="button" [class.active]="method==='type'" (click)="method='type'; renderTyped()">Taper</button>
              <button type="button" [class.active]="method==='upload'" (click)="method='upload'">Importer</button>
            </div>

            <div *ngIf="method==='draw'" class="pad-wrap">
              <canvas #pad width="360" height="160"
                (mousedown)="startDraw($event)"
                (mousemove)="draw($event)"
                (mouseup)="endDraw()"
                (mouseleave)="endDraw()"
                (touchstart)="startDraw($event)"
                (touchmove)="draw($event)"
                (touchend)="endDraw()"></canvas>
              <div class="row">
                <button type="button" class="ghost" (click)="clearPad()">Effacer</button>
              </div>
            </div>

            <div *ngIf="method==='type'">
              <label>Votre nom
                <input [(ngModel)]="typedName" (ngModelChange)="renderTyped()" />
              </label>
              <div class="styles">
                <button type="button" *ngFor="let s of styles" [class.active]="fontStyle===s" (click)="fontStyle=s; renderTyped()">{{ s }}</button>
              </div>
              <canvas #typedCanvas width="360" height="120" class="typed"></canvas>
            </div>

            <div *ngIf="method==='upload'">
              <input type="file" accept="image/*" (change)="onUpload($event)" />
              <img *ngIf="uploadedDataUrl" [src]="uploadedDataUrl" alt="Signature" />
            </div>

            <p class="error" *ngIf="error">{{ error }}</p>
            <p class="okmsg" *ngIf="success">{{ success }}</p>

            <div class="row">
              <button type="button" class="danger" (click)="decline()">Refuser</button>
              <button type="button" class="primary" (click)="sign()" [disabled]="loading">Signer</button>
            </div>
          </div>

          <div class="cert">
            <h3>Certificat / Audit</h3>
            <p>Document ID : {{ session.audit_certificate_preview.document_id }}</p>
            <p>Hash SHA-256 : {{ session.audit_certificate_preview.hash }}</p>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .page { min-height: 100vh; padding: 1.2rem; background:
      radial-gradient(circle at top left, rgba(4,104,177,.18), transparent 40%),
      linear-gradient(180deg, #E8F3FA, #f8fafc); }
    header { display:flex; justify-content:space-between; gap:1rem; margin-bottom:1rem; }
    .eyebrow { margin:0; letter-spacing:.14em; color:#0468B1; font-size:.75rem; font-weight:700; }
    h1 { margin:.2rem 0; font-family:"Fraunces", Georgia, serif; color:#023A6C; }
    .meta span { background:#ecfeff; color:#0468B1; padding:.4rem .8rem; border-radius:999px; font-weight:700; }
    .meta span.ok { background:#dcfce7; color:#166534; }
    .layout { display:grid; grid-template-columns: 1.4fr 1fr; gap:1rem; }
    .card { background:rgba(255,255,255,.9); border:1px solid #cfe8e4; border-radius:16px; padding:1rem; }
    .pdf iframe { width:100%; height:75vh; border:0; border-radius:12px; background:#fff; }
    h2,h3 { color:#023A6C; }
    .field { margin-bottom:.8rem; }
    label { display:grid; gap:.35rem; font-weight:600; color:#023A6C; }
    input, button { font:inherit; border-radius:10px; border:1px solid #b7d4cf; padding:.65rem .8rem; }
    .tabs, .styles, .row { display:flex; gap:.5rem; flex-wrap:wrap; margin:.6rem 0; }
    .tabs button.active, .styles button.active { background:#0468B1; color:#fff; border-color:#0468B1; }
    canvas { width:100%; border:1px dashed #94a3b8; border-radius:12px; background:#fff; touch-action: none; }
    img { max-width:100%; margin-top:.6rem; border:1px solid #d7e5e2; border-radius:10px; }
    .primary { background:#0468B1; color:#fff; border-color:#0468B1; font-weight:700; cursor:pointer; }
    .danger { background:#fff; color:#b91c1c; border-color:#fecaca; cursor:pointer; }
    .ghost { background:#fff; cursor:pointer; }
    .error { color:#b91c1c; }
    .okmsg { color:#166534; }
    .cert { margin-top:1rem; padding-top:1rem; border-top:1px solid #e2e8f0; font-size:.9rem; color:#475569; word-break: break-all; }
    @media (max-width: 960px) { .layout { grid-template-columns:1fr; } .pdf iframe { height:50vh; } }
  `],
})
export class SigningComponent implements OnInit, AfterViewInit {
  @ViewChild('pad') padRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('typedCanvas') typedRef?: ElementRef<HTMLCanvasElement>;

  session: SigningSession | null = null;
  token = '';
  pdfUrl: SafeResourceUrl | null = null;
  method: 'draw' | 'type' | 'upload' = 'draw';
  typedName = '';
  fontStyle: 'A' | 'B' | 'C' | 'D' = 'A';
  styles: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
  uploadedDataUrl = '';
  fieldValues: Record<number, any> = {};
  loading = false;
  error = '';
  success = '';

  private drawing = false;
  private hasInk = false;

  constructor(
    private route: ActivatedRoute,
    private signing: SigningService,
    private http: HttpClient,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    this.signing.load(this.token).subscribe((session) => {
      this.session = session;
      this.typedName = `${session.signer.first_name} ${session.signer.last_name}`;
      for (const f of session.fields) {
        if (f.type === 'name') this.fieldValues[f.id!] = this.typedName;
        if (f.type === 'date') this.fieldValues[f.id!] = new Date().toISOString().slice(0, 16);
        if (f.type === 'checkbox') this.fieldValues[f.id!] = false;
      }
      this.signing.markViewed(this.token).subscribe();
      this.http.get(this.signing.fileUrl(this.token), { responseType: 'blob' }).subscribe((blob) => {
        this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(URL.createObjectURL(blob));
      });
    });
  }

  ngAfterViewInit() {
    // canvas ready via ViewChild when template renders
  }

  private point(event: MouseEvent | TouchEvent) {
    const canvas = this.padRef!.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in event) {
      const t = event.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  }

  startDraw(event: MouseEvent | TouchEvent) {
    if (!this.padRef) return;
    event.preventDefault();
    this.drawing = true;
    const ctx = this.padRef.nativeElement.getContext('2d')!;
    const p = this.point(event);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  draw(event: MouseEvent | TouchEvent) {
    if (!this.drawing || !this.padRef) return;
    event.preventDefault();
    const ctx = this.padRef.nativeElement.getContext('2d')!;
    const p = this.point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    this.hasInk = true;
  }

  endDraw() {
    this.drawing = false;
  }

  clearPad() {
    const canvas = this.padRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.hasInk = false;
  }

  renderTyped() {
    const canvas = this.typedRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fonts: Record<string, string> = {
      A: 'italic 40px "Fraunces", Georgia, serif',
      B: '700 38px "Segoe Script", cursive',
      C: 'italic 36px "Palatino Linotype", serif',
      D: '600 34px "Comic Sans MS", cursive',
    };
    ctx.fillStyle = '#0f172a';
    ctx.font = fonts[this.fontStyle];
    ctx.fillText(this.typedName || 'Signature', 20, 75);
  }

  onUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.uploadedDataUrl = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  private signatureDataUrl(): string | null {
    if (this.method === 'draw') {
      if (!this.hasInk || !this.padRef) return null;
      return this.padRef.nativeElement.toDataURL('image/png');
    }
    if (this.method === 'type') {
      this.renderTyped();
      return this.typedRef?.nativeElement.toDataURL('image/png') || null;
    }
    return this.uploadedDataUrl || null;
  }

  sign() {
    if (!this.session) return;
    const image = this.signatureDataUrl();
    if (!image) {
      this.error = 'Ajoutez une signature.';
      return;
    }
    this.loading = true;
    this.error = '';
    this.signing.complete(this.token, {
      method: this.method,
      signature_image: image,
      typed_name: this.typedName,
      field_values: this.fieldValues,
    }).subscribe({
      next: () => {
        this.loading = false;
        this.success = 'Document signe avec succes.';
        this.session = { ...this.session!, can_sign: false };
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Signature impossible';
      },
    });
  }

  decline() {
    const reason = prompt('Motif du refus ?') || '';
    if (!reason) return;
    this.signing.decline(this.token, reason).subscribe({
      next: () => {
        this.success = 'Document refuse.';
        this.session = { ...this.session!, can_sign: false };
      },
      error: (err) => {
        this.error = err?.error?.message || 'Refus impossible';
      },
    });
  }
}
