import { Component, EventEmitter, Output, forwardRef, inject, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { AddressContact, ContactService } from '../services/contact.service';

@Component({
  selector: 'app-email-picker',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => EmailPickerComponent),
      multi: true,
    },
  ],
  template: `
    <div class="wrap">
      <input
        type="email"
        [value]="value()"
        [placeholder]="placeholder"
        autocomplete="off"
        (focus)="open()"
        (input)="onType($event)"
        (blur)="scheduleClose()"
      />
      @if (opened()) {
        <div class="list" (mousedown)="$event.preventDefault()">
          @if (outlookHint()) {
            <p class="hint">{{ outlookHint() }}</p>
          }
          @for (c of filtered(); track c.email) {
            <button type="button" class="item" (click)="pick(c)">
              <strong>{{ c.display_name || c.email }}</strong>
              <small>{{ c.email }}{{ c.source === 'outlook' ? ' · Outlook' : '' }}</small>
            </button>
          } @empty {
            <p class="empty">Aucun contact. Saisissez l’e-mail, ou connectez Outlook dans Paramètres.</p>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .wrap{position:relative;}
    input{width:100%;box-sizing:border-box;font:inherit;border-radius:.55rem;border:1px solid #cbd5e1;padding:.65rem .8rem;}
    .list{position:absolute;z-index:20;left:0;right:0;top:calc(100% + 4px);max-height:240px;overflow:auto;background:#fff;border:1px solid #cbd5e1;border-radius:.6rem;box-shadow:0 10px 30px rgba(2,58,108,.12);}
    .item{width:100%;text-align:left;background:#fff;border:0;border-bottom:1px solid #f1f5f9;padding:.65rem .8rem;display:grid;gap:.15rem;cursor:pointer;font:inherit;}
    .item:hover{background:#E8F3FA;}
    .item strong{color:#023A6C;font-size:.92rem;}
    .item small{color:#64748b;}
    .empty,.hint{margin:0;padding:.7rem .8rem;color:#64748b;font-size:.82rem;}
    .hint{background:#E8F3FA;color:#023A6C;}
  `],
})
export class EmailPickerComponent implements ControlValueAccessor {
  private readonly contactsApi = inject(ContactService);

  @Output() picked = new EventEmitter<AddressContact>();
  placeholder = 'Cliquez pour choisir, ou saisissez un e-mail';

  readonly value = signal('');
  readonly opened = signal(false);
  readonly filtered = signal<AddressContact[]>([]);
  readonly outlookHint = signal('');
  private onChange: (v: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  writeValue(v: string | null): void {
    this.value.set(v || '');
  }

  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  open() {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.opened.set(true);
    this.load(this.value());
  }

  onType(event: Event) {
    const next = (event.target as HTMLInputElement).value;
    this.value.set(next);
    this.onChange(next);
    this.opened.set(true);
    this.load(next);
  }

  pick(contact: AddressContact) {
    this.value.set(contact.email);
    this.onChange(contact.email);
    this.picked.emit(contact);
    this.opened.set(false);
    this.onTouched();
  }

  scheduleClose() {
    this.onTouched();
    this.closeTimer = setTimeout(() => this.opened.set(false), 180);
  }

  private load(q: string) {
    this.contactsApi.list(q).subscribe({
      next: (res) => {
        this.filtered.set(res.data || []);
        if (res.outlook?.connected) {
          this.outlookHint.set('Carnet Outlook 365 connecté' + (res.outlook.email ? ' (' + res.outlook.email + ')' : ''));
        } else if (res.outlook?.configured) {
          this.outlookHint.set('Connectez Outlook 365 dans Paramètres pour voir vos contacts Microsoft.');
        } else {
          this.outlookHint.set('');
        }
      },
      error: () => this.filtered.set([]),
    });
  }
}
