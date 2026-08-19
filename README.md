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

### 2. Render (recommandé — sans carte bancaire)

Compte avec e-mail / GitHub, **pas de VM Oracle**. HTTPS inclus. Word/Excel → PDF n’est pas disponible sur ce plan (image trop lourde) : testez avec des **PDF**.

1. Poussez ce dépôt sur GitHub (`Youssouf255/signflow`).
2. Créez un compte sur [render.com](https://render.com) (Continue with GitHub).
3. **New +** → **Blueprint** → sélectionnez le dépôt `signflow`.
4. Appliquez le Blueprint (`render.yaml`) : un service web + PostgreSQL.
5. Attendez le build (souvent 8–15 min).
6. Ouvrez l’URL `https://signflow-xxxx.onrender.com`.

Compte démo : `youssouf@signflow.local` / `password`.

L’app s’endort après ~15 min d’inactivité (premier chargement ~1 min). Postgres gratuit expire après 30 jours.

### 3. Sans aucun cloud : tunnel depuis ce PC

Si Docker prod tourne déjà sur http://localhost/ :

```powershell
.\cloud\publier-local.ps1
```

Cloudflare affiche une URL `https://xxxxx.trycloudflare.com`. Elle change à chaque lancement. Le PC doit rester allumé.

### 4. Oracle Cloud Always Free (si l’inscription aboutit plus tard)

#### A. Compte et clé SSH (sur votre PC Windows)

1. Créez le compte : [cloud.oracle.com](https://www.oracle.com/cloud/free/). Choisissez une **Home Region** avec Ampere (ex. Frankfurt, Amsterdam, Ashburn) : elle ne se change plus.
2. Générez la clé SSH dans PowerShell :

```powershell
.\cloud\generer-cle-ssh-oracle.ps1
```

Copiez le bloc `ssh-rsa ...` affiché (clé **publique**).

#### B. Créer la VM dans la console Oracle

1. **Compute → Instances → Create instance**.
2. Image : **Canonical Ubuntu 24.04** (variante **aarch64** / ARM).
3. Shape : **Ampere** → `VM.Standard.A1.Flex` → **4 OCPU** et **24 GB** memory. Badge Always Free-eligible.
4. Disque de boot : **100 GB** si possible (images Docker + LibreOffice).
5. Clés SSH : **Paste public key** → collez la clé du script.
6. Vérifiez qu’une **IP publique** est assignée, puis Create.
7. Si « Out of capacity » : changez d’Availability Domain, ou une autre région proche, puis réessayez.

#### C. Ouvrir le port 80 (indispensable)

Oracle bloque le web tant que cette règle n’existe pas :

1. Cliquez l’instance → **Virtual cloud network** (ou **Subnet**).
2. **Security Lists** → Default Security List → **Add Ingress Rules**.
3. Source CIDR `0.0.0.0/0`, IP protocol **TCP**, Destination port **80**.
4. Ajoutez la même règle pour le port **443** (HTTPS plus tard).

Laissez le port **22** ouvert pour SSH.

#### D. Installer SignFlow sur la VM

Dans PowerShell, remplacez `IP_PUBLIQUE` :

```powershell
ssh -i $HOME\.ssh\oracle_signflow ubuntu@IP_PUBLIQUE
```

Sur la VM :

```bash
curl -fsSL https://raw.githubusercontent.com/Youssouf255/signflow/main/cloud/oracle-setup.sh | bash
```

La **première** construction dure souvent **15 à 40 minutes** (LibreOffice). Ensuite ouvrez `http://IP_PUBLIQUE/`.

Compte démo : `youssouf@signflow.local` / `password` (ou `youssouf.bah@undp.org`).

Les e-mails d’invitation sont dans les logs Docker (`MAIL_MAILER=log`). Utilisez **Signer maintenant** dans l’interface.

Suivi :

```bash
cd ~/signflow
sudo docker compose -f docker-compose.prod.yml --env-file .env.production logs -f
```

**Important :** le script `oracle-setup.sh` doit être présent sur GitHub (`main`). Poussez ce dépôt avant d’exécuter le `curl` sur la VM.

### 3. Autre VPS (DigitalOcean, Contabo, AWS…)

Même principe : Ubuntu + Docker, clone du dépôt, puis `bash cloud/oracle-setup.sh` (le script fonctionne hors Oracle). Ouvrez le port 80 dans le pare-feu du fournisseur.

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
