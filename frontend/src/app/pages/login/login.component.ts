import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="auth-page">
      <img class="pnud-logo" src="/pnud-logo.png" alt="PNUD" />
      <div class="panel">
        <p class="eyebrow">Plateforme de signature</p>
        <h1>Plateforme E-Signature</h1>
        <p class="sub">Connectez-vous pour envoyer et suivre vos documents.</p>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>Email<input type="email" formControlName="email" /></label>
          <label>Mot de passe<input type="password" formControlName="password" /></label>
          @if (error()) { <p class="error">{{ error() }}</p> }
          <button type="submit" [disabled]="form.invalid || loading()">Se connecter</button>
        </form>
        <p class="foot">Pas de compte ? <a routerLink="/register">Créer un compte</a></p>
      </div>
    </div>
  `,
  styles: [`
    .auth-page { min-height: 100vh; display: grid; place-items: center; padding: 1.5rem; position: relative;
      background: radial-gradient(circle at 20% 20%, #D6EAF8, transparent 40%),
                  radial-gradient(circle at 80% 10%, #dbe7f5, transparent 35%),
                  linear-gradient(160deg, #F5F9FC, #e8eef3); }
    .pnud-logo { position: absolute; top: 1rem; right: 1.2rem; height: 64px; width: auto; object-fit: contain; }
    .panel { width: min(420px, 100%); background: rgba(255,255,255,.78); backdrop-filter: blur(8px);
      border: 1px solid rgba(4,104,177,.15); border-radius: 1rem; padding: 2rem; box-shadow: 0 20px 50px rgba(15,23,42,.08); }
    .eyebrow { text-transform: uppercase; letter-spacing: .12em; font-size: .72rem; color: #0468B1; margin: 0; }
    h1 { font-family: "Space Grotesk", sans-serif; font-size: 1.7rem; margin: .4rem 0; color: #023A6C; line-height: 1.2; }
    .sub { color: #475569; margin-bottom: 1.4rem; }
    form { display: grid; gap: .9rem; }
    label { display: grid; gap: .35rem; font-size: .9rem; color: #334155; }
    input { border: 1px solid #cbd5e1; border-radius: .55rem; padding: .7rem .8rem; font: inherit; }
    button { background: #0468B1; color: #fff; border: 0; border-radius: .55rem; padding: .8rem; font-weight: 600; cursor: pointer; }
    button:disabled { opacity: .6; cursor: not-allowed; }
    .error { color: #b91c1c; margin: 0; }
    .foot { margin-top: 1rem; color: #64748b; }
    a { color: #0468B1; }
  `],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal('');

  readonly form = this.fb.nonNullable.group({
    email: ['youssouf.bah@undp.org', [Validators.required, Validators.email]],
    password: ['password', [Validators.required]],
  });

  submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/app/dashboard');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Connexion impossible');
      },
    });
  }
}
