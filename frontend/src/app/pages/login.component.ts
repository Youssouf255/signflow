import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="auth-page">
      <div class="panel">
        <p class="eyebrow">Plateforme de signature</p>
        <h1>Plateforme E-Signature</h1>
        <p class="lead">Connectez-vous pour envoyer et suivre vos documents.</p>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>Email<input type="email" formControlName="email" /></label>
          <label>Mot de passe<input type="password" formControlName="password" /></label>
          <p class="error" *ngIf="error">{{ error }}</p>
          <button type="submit" [disabled]="form.invalid || loading">Se connecter</button>
        </form>
        <p class="hint">Demo : youssouf.bah@undp.org / password</p>
        <a routerLink="/register">Creer un compte</a>
      </div>
    </div>
  `,
  styles: [`
    .auth-page {
      min-height: 100vh; display: grid; place-items: center; padding: 2rem;
      background:
        radial-gradient(circle at 15% 20%, rgba(4,104,177,.25), transparent 40%),
        radial-gradient(circle at 85% 10%, rgba(20,184,166,.2), transparent 35%),
        linear-gradient(160deg, #ecfeff, #f8fafc 55%, #ccfbf1);
    }
    .panel {
      width: min(420px, 100%); background: rgba(255,255,255,.82); border: 1px solid #cfe8e4;
      border-radius: 20px; padding: 2rem; box-shadow: 0 20px 50px rgba(4,104,177,.12);
    }
    h1 { font-family: "Fraunces", Georgia, serif; margin: .2rem 0 .6rem; color: #023A6C; font-size: 2.4rem; }
    .eyebrow { text-transform: uppercase; letter-spacing: .12em; font-size: .75rem; color: #0468B1; margin: 0; }
    .lead { color: #475569; margin-bottom: 1.4rem; }
    form { display: grid; gap: .9rem; }
    label { display: grid; gap: .35rem; font-weight: 600; color: #023A6C; }
    input, button {
      font: inherit; border-radius: 10px; border: 1px solid #b7d4cf; padding: .75rem .9rem; background: #fff;
    }
    button {
      background: #0468B1; color: #fff; border-color: #0468B1; cursor: pointer; font-weight: 700;
    }
    button:disabled { opacity: .6; cursor: not-allowed; }
    .error { color: #b91c1c; margin: 0; }
    .hint { font-size: .85rem; color: #64748b; }
    a { color: #0468B1; font-weight: 600; }
  `],
})
export class LoginComponent {
  loading = false;
  error = '';
  form = this.fb.group({
    email: ['youssouf.bah@undp.org', [Validators.required, Validators.email]],
    password: ['password', Validators.required],
  });

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {}

  submit() {
    if (this.form.invalid) return;
    this.loading = true;
    this.error = '';
    this.auth.login(this.form.getRawValue() as { email: string; password: string }).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigateByUrl('/app/dashboard');
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Connexion impossible';
      },
    });
  }
}
