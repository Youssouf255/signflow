import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface AddressContact {
  email: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  source?: 'signflow' | 'outlook';
}

export interface ContactsResponse {
  data: AddressContact[];
  outlook?: {
    configured?: boolean;
    connected?: boolean;
    email?: string | null;
  };
}

@Injectable({ providedIn: 'root' })
export class ContactService {
  private readonly api = inject(ApiService);

  list(q = ''): Observable<ContactsResponse> {
    return this.api.get<ContactsResponse>('contacts', q ? { q } : undefined);
  }

  status() {
    return this.api.get<ContactsResponse['outlook']>('microsoft/status');
  }

  connect() {
    return this.api.get<{ url: string }>('microsoft/connect');
  }

  disconnect() {
    return this.api.delete<{ connected: boolean }>('microsoft/disconnect');
  }
}
