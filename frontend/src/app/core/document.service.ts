import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { DashboardData, DocItem, SignatureField, Signer } from './models';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  constructor(private http: HttpClient) {}

  dashboard() {
    return this.http.get<DashboardData>(`${environment.apiUrl}/dashboard`);
  }

  list(params?: { status?: string; search?: string }) {
    let httpParams = new HttpParams();
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.search) httpParams = httpParams.set('search', params.search);
    return this.http.get<{ data: DocItem[] }>(`${environment.apiUrl}/documents`, { params: httpParams });
  }

  get(id: number) {
    return this.http.get<DocItem>(`${environment.apiUrl}/documents/${id}`);
  }

  create(form: FormData) {
    return this.http.post<DocItem>(`${environment.apiUrl}/documents`, form);
  }

  syncSigners(id: number, signers: Partial<Signer>[]) {
    return this.http.post<DocItem>(`${environment.apiUrl}/documents/${id}/signers`, { signers });
  }

  syncFields(id: number, fields: SignatureField[]) {
    return this.http.post<DocItem>(`${environment.apiUrl}/documents/${id}/fields`, { fields });
  }

  send(id: number) {
    return this.http.post<DocItem>(`${environment.apiUrl}/documents/${id}/send`, {});
  }

  fileUrl(id: number) {
    return `${environment.apiUrl}/documents/${id}/file`;
  }
}
