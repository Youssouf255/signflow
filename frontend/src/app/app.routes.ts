import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app/dashboard' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'sign/:token',
    loadComponent: () => import('./pages/sign/sign.component').then((m) => m.SignComponent),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'documents',
        loadComponent: () => import('./pages/documents/documents.component').then((m) => m.DocumentsComponent),
      },
      {
        path: 'documents/new',
        loadComponent: () =>
          import('./pages/documents/document-create.component').then((m) => m.DocumentCreateComponent),
      },
      {
        path: 'documents/:id/signers',
        loadComponent: () =>
          import('./pages/documents/document-signers.component').then((m) => m.DocumentSignersComponent),
      },
      {
        path: 'documents/:id/editor',
        loadComponent: () =>
          import('./pages/documents/document-editor.component').then((m) => m.DocumentEditorComponent),
      },
      {
        path: 'documents/:id',
        loadComponent: () =>
          import('./pages/documents/document-detail.component').then((m) => m.DocumentDetailComponent),
      },
      {
        path: 'signers',
        loadComponent: () => import('./pages/signers/signers.component').then((m) => m.SignersComponent),
      },
      {
        path: 'settings',
        loadComponent: () => import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'app/dashboard' },
];
