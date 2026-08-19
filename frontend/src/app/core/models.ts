export interface User {
  id: number;
  name: string;
  email: string;
}

export type DocumentStatus =
  | 'draft'
  | 'sent'
  | 'in_progress'
  | 'completed'
  | 'declined'
  | 'expired'
  | 'cancelled';

export type SignerRole = 'signer' | 'observer' | 'approver';
export type FieldType = 'signature' | 'initials' | 'name' | 'date' | 'text' | 'checkbox';

export interface Signer {
  id: number;
  document_id?: number;
  first_name: string;
  last_name: string;
  email: string;
  signing_order: number;
  role: SignerRole;
  status: string;
  signed_at?: string | null;
  access_token?: string;
}

export interface SignatureField {
  id?: number;
  document_id?: number;
  signer_id: number;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  label?: string | null;
  value?: string | null;
  _localId?: string;
}

export interface AuditLog {
  id: number;
  event: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  signer?: Signer | null;
}

export interface DocItem {
  id: number;
  reference: string;
  title: string;
  description?: string;
  status: DocumentStatus;
  expires_at?: string | null;
  signers_count: number;
  created_at: string;
  signers?: Signer[];
  fields?: SignatureField[];
  audit_logs?: AuditLog[];
  original_hash?: string;
  signed_hash?: string;
}

export interface DashboardData {
  stats: {
    sent: number;
    in_progress: number;
    completed: number;
    draft: number;
  };
  recent: DocItem[];
}
