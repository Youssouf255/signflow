import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { SignatureField, Signer } from './models';

export interface SigningSession {
  signer: Signer;
  document: {
    id: number;
    reference: string;
    title: string;
    description?: string;
    status: string;
    expires_at?: string;
  };
  fields: SignatureField[];
  signers: Signer[];
  can_sign: boolean;
  audit_certificate_preview: {
    document_id: string;
    hash: string;
  };
}

@Injectable({ providedIn: 'root' })
export class SigningService {
  constructor(private http: HttpClient) {}

  load(token: string) {
    return this.http.get<SigningSession>(`${environment.apiUrl}/sign/${token}`);
  }

  markViewed(token: string) {
    return this.http.post(`${environment.apiUrl}/sign/${token}/viewed`, {});
  }

  fileUrl(token: string) {
    return `${environment.apiUrl}/sign/${token}/file`;
  }

  complete(token: string, payload: {
    method: 'draw' | 'type' | 'upload';
    signature_image?: string;
    typed_name?: string;
    field_values?: Record<string, string | boolean>;
  }) {
    return this.http.post(`${environment.apiUrl}/sign/${token}/complete`, payload);
  }

  decline(token: string, reason: string) {
    return this.http.post(`${environment.apiUrl}/sign/${token}/decline`, { reason });
  }
}
