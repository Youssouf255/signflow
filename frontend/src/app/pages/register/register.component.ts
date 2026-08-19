import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="auth-page">
      <img class="pnud-logo" src="/pnud-logo.png" alt="PNUD" />
      <div class="panel">
        <p class="eyebrow">Créer un compte</p>
        <h1>Plateforme E-Signature</h1>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>Nom<input formControlName="name" /></label>
          <label>Email<input type="email" formControlName="email" /></label>
          <label>Mot de passe<input type="password" formControlName="password" /></label>
          <label>Confirmation<input type="password" formControlName="password_confirmation" /></label>
          @if (error()) { <p class="error">{{ error() }}</p> }
          <button type="submit" [disabled]="form.invalid || loading()">Créer mon compte</button>
        </form>
        <p class="foot">Déjà inscrit ? <a routerLink="/login">Se connecter</a></p>
      </div>
    </div>
  `,
  styles: [`
    .auth-page { min-height: 100vh; display: grid; place-items: center; padding: 1.5rem; position: relative;
      background: radial-gradient(circle at 20% 20%, #D6EAF8, transparent 40%), linear-gradient(160deg, #F5F9FC, #e8eef3); }
    .pnud-logo { position: absolute; top: 1rem; right: 1.2rem; height: 64px; width: auto; object-fit: contain; }
    .panel { width: min(440px, 100%); background: rgba(255,255,255,.8); border-radius: 1rem; padding: 2rem; border: 1px solid rgba(4,104,177,.15); }
    .eyebrow { text-transform: uppercase; letter-spacing: .12em; font-size: .72rem; color: #0468B1; margin: 0; }
    h1 { font-family: "Space Grotesk", sans-serif; color: #023A6C; margin: .4rem 0 1.2rem; }
    form { display: grid; gap: .85rem; }
    label { display: grid; gap: .3rem; color: #334155; }
    input { border: 1px solid #cbd5e1; border-radius: .55rem; padding: .7rem .8rem; font: inherit; }
    button { background: #0468B1; color: #fff; border: 0; border-radius: .55rem; padding: .8rem; font-weight: 600; cursor: pointer; }
    .error { color: #b91c1c; }
    .foot { margin-top: 1rem; color: #64748b; }
    a { color: #0468B1; }
  `],
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    password_confirmation: ['', Validators.required],
  });

  submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    const v = this.form.getRawValue();
    this.auth.register(v.name, v.email, v.password, v.password_confirmation).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/app/dashboard');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Inscription impossible');
      },
    });
  }
}
