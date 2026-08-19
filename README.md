# SignFlow — Plateforme de signature électronique (MVP)

MVP type DocuSign basé sur **Angular + Laravel + PostgreSQL**, avec workflow de signature ordonnée, placement de champs, liens sécurisés, audit trail et certificat de signature.

## Stack

| Composant | Technologie |
|-----------|-------------|
| Frontend | Angular 19 |
| Backend | Laravel 11 (REST API) |
| Auth | Laravel Sanctum |
| Base | PostgreSQL |
| PDF | FPDI / FPDF |
| Signature | Signature Pad |
| Stockage | Local (MVP) / MinIO-S3 |
| Emails | SMTP (Mailpit en local) |
| Queue / Cache | Redis |
| Déploiement | Docker Compose |

## Démarrage rapide (Docker)

Prérequis : Docker Desktop démarré.

```bash
docker compose up --build
```

Services :

- Frontend : http://localhost:4200
- API : http://localhost:8000/api
- Mailpit : http://localhost:8025
- MinIO console : http://localhost:9001 (`signflow` / `signflowsecret`)

Compte démo :

- Email : `youssouf@signflow.local` ou `youssouf.bah@undp.org`
- Mot de passe : `password`

## Production (Docker) et cloud

Stack : Angular (nginx) + Laravel + PostgreSQL + Redis + LibreOffice (conversion Word/Excel → PDF). Un seul port public : **80**.

### 1. Sur cette machine (test local prod)

```powershell
.\start-prod.ps1
```

Le premier lancement crée `.env.production`. Renseignez `APP_URL` et `FRONTEND_URL` (`http://localhost` en local), puis relancez le script.

Puis ouvrez http://localhost/

### 2. Sur un VPS cloud (DigitalOcean, Oracle, Contabo, AWS…)

1. Créez un serveur Ubuntu 22.04 avec Docker + Docker Compose.
2. Copiez le projet (git clone ou zip).
3. Copiez `.env.production.example` vers `.env.production`.
4. Générez une clé : `docker run --rm php:8.3-cli php -r "echo 'base64:'.base64_encode(random_bytes(32));"`
5. Remplacez `VOTRE_IP_OU_DOMAINE` par l’IP publique ou le domaine (`http://203.0.113.10` ou `https://signflow.mondomaine.com`).
6. Lancez :

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

L’application est alors sur `http://IP/` (ouvrez le port **80** dans le pare-feu).

Pour HTTPS plus tard : placez Caddy ou un reverse-proxy (Nginx + Let’s Encrypt) devant le port 80.

Les emails d’invitation sont écrits dans les logs (`MAIL_MAILER=log`) en test. Les liens **Signer maintenant** restent utilisables dans l’interface.

## Workflow MVP

1. **Création d’un dossier** — upload PDF, titre, description, expiration
2. **Ajout des signataires** — nom, prénom, email, ordre, rôle (Signataire / Observateur / Approbateur)
3. **Placement des champs** — signature, initiales, nom, date, texte, case à cocher
4. **Envoi** — emails avec lien sécurisé, signature séquentielle
5. **Interface de signature** — visualiser, dessiner / taper / importer, signer ou refuser
6. **Traçabilité** — événements + IP + user-agent + hash SHA-256 + certificat PDF

## Structure

```
├── backend/          # Laravel API
├── frontend/         # Angular app
└── docker-compose.yml
```

## API principale

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

### Documents (Bearer token)
- `GET /api/dashboard`
- `GET|POST /api/documents`
- `GET|PUT|DELETE /api/documents/{id}`
- `POST /api/documents/{id}/signers`
- `POST /api/documents/{id}/fields`
- `POST /api/documents/{id}/send`
- `GET /api/documents/{id}/file`

### Signature publique
- `GET /api/sign/{token}`
- `GET /api/sign/{token}/file`
- `POST /api/sign/{token}/complete`
- `POST /api/sign/{token}/decline`

## Développement local sans Docker (avancé)

Nécessite PHP 8.2+, Composer, Node 20+, PostgreSQL, Redis.

```bash
# Backend
cd backend
cp .env.example .env
composer install
php artisan key:generate
php artisan migrate --seed
php artisan serve

# Frontend
cd frontend
npm install
npm start
```

## Notes sécurité MVP

- Lien de signature unique par signataire (`access_token`)
- Hash SHA-256 du document avant/après signature
- Journal d’audit (création, envoi, ouverture, consultation, signature, finalisation)
- Certificat PDF généré à la finalisation
- Le MVP n’est pas une signature qualifiée eIDAS ; il pose les bases (empreinte, audit, non-répudiation soft)
