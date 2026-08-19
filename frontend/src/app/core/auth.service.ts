import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { User } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storageKey = 'signflow_token';
  readonly user = signal<User | null>(null);

  constructor(private http: HttpClient, private router: Router) {
    const cached = localStorage.getItem('signflow_user');
    if (cached) {
      this.user.set(JSON.parse(cached));
    }
  }

  get token(): string | null {
    return localStorage.getItem(this.storageKey);
  }

  get isAuthenticated(): boolean {
    return !!this.token;
  }

  register(payload: { name: string; email: string; password: string; password_confirmation: string }) {
    return this.http.post<{ user: User; token: string }>(`${environment.apiUrl}/auth/register`, payload).pipe(
      tap((res) => this.persist(res.user, res.token))
    );
  }

  login(payload: { email: string; password: string }) {
    return this.http.post<{ user: User; token: string }>(`${environment.apiUrl}/auth/login`, payload).pipe(
      tap((res) => this.persist(res.user, res.token))
    );
  }

  me() {
    return this.http.get<User>(`${environment.apiUrl}/auth/me`).pipe(
      tap((user) => {
        this.user.set(user);
        localStorage.setItem('signflow_user', JSON.stringify(user));
      })
    );
  }

  logout() {
    const done = () => {
      localStorage.removeItem(this.storageKey);
      localStorage.removeItem('signflow_user');
      this.user.set(null);
      this.router.navigateByUrl('/login');
    };

    if (!this.token) {
      done();
      return;
    }

    this.http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe({
      next: done,
      error: done,
    });
  }

  private persist(user: User, token: string) {
    localStorage.setItem(this.storageKey, token);
    localStorage.setItem('signflow_user', JSON.stringify(user));
    this.user.set(user);
  }
}
