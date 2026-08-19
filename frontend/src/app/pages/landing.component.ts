import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="hero">
      <nav>
        <strong>Plateforme E-Signature</strong>
        <div>
          <a routerLink="/login">Connexion</a>
          <a class="cta" routerLink="/register">Commencer</a>
        </div>
      </nav>
      <main>
        <h1>Plateforme E-Signature</h1>
        <p>Envoyez, signez et tracez vos documents en toute confiance.</p>
        <div class="actions">
          <a class="cta" routerLink="/register">Creer un compte</a>
          <a class="ghost" routerLink="/login">Se connecter</a>
        </div>
      </main>
    </div>
  `,
  styles: [`
    .hero {
      min-height: 100vh; color: #042f2e;
      background:
        linear-gradient(120deg, rgba(4,104,177,.88), rgba(19,78,74,.72)),
        url('https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1800&q=80') center/cover;
      display: flex; flex-direction: column;
    }
    nav, main { width: min(1100px, calc(100% - 2rem)); margin: 0 auto; }
    nav { display:flex; justify-content:space-between; align-items:center; padding: 1.2rem 0; color:#ecfeff; }
    nav a { color:#ecfeff; text-decoration:none; margin-left:1rem; font-weight:600; }
    main { flex:1; display:flex; flex-direction:column; justify-content:center; color:#E8F3FA; padding-bottom:4rem; }
    h1 {
      font-family:"Fraunces", Georgia, serif; font-size: clamp(3rem, 8vw, 6rem);
      margin:0; letter-spacing:.04em;
    }
    p { font-size:1.2rem; max-width:34rem; color:#ccfbf1; }
    .actions { display:flex; gap:.8rem; margin-top:1.2rem; }
    .cta, .ghost { text-decoration:none; padding:.85rem 1.2rem; border-radius:12px; font-weight:700; }
    .cta { background:#99f6e4; color:#023A6C; }
    .ghost { border:1px solid rgba(204,251,241,.7); color:#ecfeff; }
  `],
})
export class LandingComponent {}
