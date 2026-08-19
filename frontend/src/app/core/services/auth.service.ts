import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { ApiService } from './api.service';

export interface User {
  id: number;
  name: string;
  email: string;
}

interface AuthResponse {
  user: User;
  token: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly user = signal<User | null>(this.readUser());
  readonly token = signal<string | null>(localStorage.getItem('signflow_token'));

  get isAuthenticated(): boolean {
    return !!this.token();
  }

  login(email: string, password: string) {
    return this.api.post<AuthResponse>('auth/login', { email, password }).pipe(
      tap((res) => this.persist(res))
    );
  }

  register(name: string, email: string, password: string, password_confirmation: string) {
    return this.api
      .post<AuthResponse>('auth/register', { name, email, password, password_confirmation })
      .pipe(tap((res) => this.persist(res)));
  }

  me() {
    return this.api.get<User>('auth/me').pipe(tap((user) => {
      this.user.set(user);
      localStorage.setItem('signflow_user', JSON.stringify(user));
    }));
  }

  logout() {
    const done = () => {
      localStorage.removeItem('signflow_token');
      localStorage.removeItem('signflow_user');
      this.token.set(null);
      this.user.set(null);
      this.router.navigateByUrl('/login');
    };

    if (!this.token()) {
      done();
      return;
    }

    this.api.post('auth/logout').subscribe({ next: done, error: done });
  }

  private persist(res: AuthResponse) {
    localStorage.setItem('signflow_token', res.token);
    localStorage.setItem('signflow_user', JSON.stringify(res.user));
    this.token.set(res.token);
    this.user.set(res.user);
  }

  private readUser(): User | null {
    const raw = localStorage.getItem('signflow_user');
    return raw ? (JSON.parse(raw) as User) : null;
  }
}
