import { Component, OnInit, inject, signal } from '@angular/core';
import { DocumentService, Signer } from '../../core/services/document.service';

@Component({
  selector: 'app-signers',
  standalone: true,
  template: `
    <div class="page">
      <h2>Signataires</h2>
      <div class="list">
        @for (s of items(); track s.id) {
          <div class="row">
            <div>
              <strong>{{ s.first_name }} {{ s.last_name }}</strong>
              <small>{{ s.email }} · {{ s.role }} · ordre {{ s.signing_order }}</small>
            </div>
            <span>{{ s.status }}</span>
          </div>
        } @empty {
          <p>Aucun signataire pour le moment.</p>
        }
      </div>
    </div>
  `,
  styles: [`
    h2{margin:0 0 1rem;font-family:"Space Grotesk",sans-serif;color:#023A6C;}
    .list{display:grid;gap:.55rem;}
    .row{display:flex;justify-content:space-between;gap:1rem;padding:1rem;background:rgba(255,255,255,.75);border-radius:.75rem;border:1px solid rgba(15,23,42,.06);}
    small{display:block;color:#64748b;margin-top:.2rem;}
  `],
})
export class SignersComponent implements OnInit {
  private readonly documents = inject(DocumentService);
  readonly items = signal<Signer[]>([]);

  ngOnInit(): void {
    this.documents.signers().subscribe((res) => this.items.set(res.data || []));
  }
}
