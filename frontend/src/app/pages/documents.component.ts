import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DocumentService } from '../core/document.service';
import { DocItem } from '../core/models';

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page">
      <div class="head">
        <h1>Documents</h1>
        <a class="btn" routerLink="/app/documents/new">+ Envoyer un document</a>
      </div>
      <div class="filters">
        <input [(ngModel)]="search" (ngModelChange)="load()" placeholder="Rechercher..." />
        <select [(ngModel)]="status" (ngModelChange)="load()">
          <option value="">Tous les statuts</option>
          <option value="draft">Brouillon</option>
          <option value="in_progress">En cours</option>
          <option value="completed">Signe</option>
          <option value="declined">Refuse</option>
        </select>
      </div>
      <div class="list">
        <a class="row" *ngFor="let doc of items" [routerLink]="['/app/documents', doc.id]">
          <div>
            <strong>{{ doc.title }}</strong>
            <small>{{ doc.reference }} · {{ doc.signers_count }} signataire(s)</small>
          </div>
          <span>{{ doc.status }}</span>
        </a>
      </div>
    </div>
  `,
  styles: [`
    .head, .filters { display: flex; justify-content: space-between; gap: 1rem; align-items: center; margin-bottom: 1rem; }
    h1 { font-family: "Fraunces", Georgia, serif; color: #023A6C; margin: 0; }
    .btn { background: #0468B1; color: #fff; text-decoration: none; padding: .7rem 1rem; border-radius: 10px; font-weight: 700; }
    input, select { border: 1px solid #b7d4cf; border-radius: 10px; padding: .65rem .8rem; font: inherit; }
    .list { background: #fff; border: 1px solid #d7e5e2; border-radius: 16px; }
    .row { display:flex; justify-content:space-between; padding:1rem; text-decoration:none; color:inherit; border-bottom:1px solid #e8f0ee; }
    .row strong { display:block; color:#023A6C; }
    .row small { color:#64748b; }
  `],
})
export class DocumentsComponent implements OnInit {
  items: DocItem[] = [];
  search = '';
  status = '';

  constructor(private documents: DocumentService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.documents.list({ search: this.search || undefined, status: this.status || undefined })
      .subscribe((res) => (this.items = res.data));
  }
}
