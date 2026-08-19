import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

export interface Signer {
  id?: number;
  first_name: string;
  last_name: string;
  email: string;
  signing_order: number;
  role: 'signer' | 'observer' | 'approver';
  status?: string;
  access_token?: string;
}

export interface SignatureField {
  id?: number;
  signer_id: number;
  type: 'signature' | 'initials' | 'name' | 'date' | 'text' | 'checkbox';
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  label?: string;
  value?: string;
}

export interface DocumentItem {
  id: number;
  title: string;
  description?: string;
  status: string;
  expires_at?: string;
  signers_count?: number;
  created_at?: string;
  signers?: Signer[];
  fields?: SignatureField[];
  audit_logs?: AuditLog[];
  document_hash?: string;
  original_hash?: string;
  signed_hash?: string;
  reference?: string;
}

export interface AuditLog {
  id: number;
  event: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  signer?: Signer;
}

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly api = inject(ApiService);

  dashboard() {
    return this.api.get<{ counts: Record<string, number>; recent: DocumentItem[] }>('dashboard');
  }

  list(params?: Record<string, string | number>) {
    return this.api.get<{ data: DocumentItem[] }>('documents', params);
  }

  get(id: number) {
    return this.api.get<DocumentItem>(`documents/${id}`);
  }

  create(formData: FormData) {
    return this.api.upload<DocumentItem>('documents', formData);
  }

  update(id: number, body: Partial<DocumentItem>) {
    return this.api.put<DocumentItem>(`documents/${id}`, body);
  }

  delete(id: number) {
    return this.api.delete(`documents/${id}`);
  }

  syncSigners(id: number, signers: Signer[]) {
    return this.api.post<DocumentItem>(`documents/${id}/signers`, { signers });
  }

  syncFields(id: number, fields: SignatureField[]) {
    return this.api.post<DocumentItem>(`documents/${id}/fields`, { fields });
  }

  send(id: number) {
    return this.api.post<DocumentItem>(`documents/${id}/send`);
  }

  reopen(id: number) {
    return this.api.post<DocumentItem>(`documents/${id}/reopen`);
  }

  replaceFile(id: number, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.api.upload<DocumentItem>(`documents/${id}/replace-file`, fd);
  }

  audit(id: number) {
    return this.api.get<AuditLog[]>(`documents/${id}/audit`);
  }

  fileUrl(id: number): string {
    return `${environment.apiUrl}/documents/${id}/file`;
  }

  publicShow(token: string) {
    return this.api.get<any>(`sign/${token}`);
  }

  publicView(token: string) {
    return this.api.post(`sign/${token}/viewed`);
  }

  publicFileUrl(token: string): string {
    return `${environment.apiUrl}/sign/${token}/file`;
  }

  publicSign(token: string, payload: unknown) {
    return this.api.post(`sign/${token}/complete`, payload);
  }

  publicDecline(token: string, reason?: string) {
    return this.api.post(`sign/${token}/decline`, { reason });
  }

  signers() {
    return this.api.get<{ data: Signer[] }>('signers');
  }
}
