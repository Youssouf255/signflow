import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="auth-page">
      <div class="panel">
        <h1>Creer un compte</h1>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>Nom<input formControlName="name" /></label>
          <label>Email<input type="email" formControlName="email" /></label>
          <label>Mot de passe<input type="password" formControlName="password" /></label>
          <label>Confirmation<input type="password" formControlName="password_confirmation" /></label>
          <p class="error" *ngIf="error">{{ error }}</p>
          <button type="submit" [disabled]="form.invalid || loading">S'inscrire</button>
        </form>
        <a routerLink="/login">Deja un compte ?</a>
      </div>
    </div>
  `,
  styles: [`
    .auth-page {
      min-height: 100vh; display: grid; place-items: center; padding: 2rem;
      background: linear-gradient(160deg, #ecfeff, #f8fafc 55%, #ccfbf1);
    }
    .panel {
      width: min(420px, 100%); background: rgba(255,255,255,.9); border-radius: 20px; padding: 2rem;
      border: 1px solid #cfe8e4;
    }
    h1 { font-family: "Fraunces", Georgia, serif; color: #023A6C; }
    form { display: grid; gap: .9rem; }
    label { display: grid; gap: .35rem; font-weight: 600; color: #023A6C; }
    input, button { font: inherit; border-radius: 10px; border: 1px solid #b7d4cf; padding: .75rem .9rem; }
    button { background: #0468B1; color: #fff; border: 0; font-weight: 700; cursor: pointer; }
    .error { color: #b91c1c; }
    a { color: #0468B1; font-weight: 600; }
  `],
})
export class RegisterComponent {
  loading = false;
  error = '';
  form = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    password_confirmation: ['', Validators.required],
  });

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {}

  submit() {
    if (this.form.invalid) return;
    this.loading = true;
    this.auth.register(this.form.getRawValue() as any).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigateByUrl('/app/dashboard');
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Inscription impossible';
      },
    });
  }
}
