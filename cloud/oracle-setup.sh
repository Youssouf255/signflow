#!/usr/bin/env bash
# Installation SignFlow sur Ubuntu (Oracle Cloud Ampere ARM 24 Go, Always Free).
# Usage, une fois connecté en SSH :
#   curl -fsSL https://raw.githubusercontent.com/Youssouf255/signflow/main/cloud/oracle-setup.sh | bash
# ou :
#   git clone https://github.com/Youssouf255/signflow.git ~/signflow
#   bash ~/signflow/cloud/oracle-setup.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Youssouf255/signflow.git}"
APP_DIR="${APP_DIR:-$HOME/signflow}"

echo "==> SignFlow — installation Oracle / Ubuntu"

if [ "$(id -u)" -eq 0 ]; then
  echo "Ne pas lancer ce script en root. Connectez-vous en ubuntu, puis relancez."
  exit 1
fi

echo "==> Paquets de base"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git openssl iptables

echo "==> Pare-feu local (ports 80 et 443)"
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT 2>/dev/null \
  || sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT 2>/dev/null \
  || sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
if command -v netfilter-persistent >/dev/null 2>&1; then
  sudo netfilter-persistent save || true
fi
if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 22/tcp || true
  sudo ufw allow 80/tcp || true
  sudo ufw allow 443/tcp || true
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installation de Docker"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

echo "==> Code source"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" pull --ff-only || true
fi
cd "$APP_DIR"

PUBLIC_IP="$(curl -4 -fsS --max-time 10 https://ifconfig.me || true)"
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP="$(curl -4 -fsS --max-time 10 https://api.ipify.org || true)"
fi
if [ -z "$PUBLIC_IP" ]; then
  echo "Impossible de détecter l'IP publique. Passez APP_URL=http://VOTRE_IP bash cloud/oracle-setup.sh"
  exit 1
fi

APP_URL="${APP_URL:-http://$PUBLIC_IP}"
echo "==> URL publique : $APP_URL"

if [ ! -f .env.production ]; then
  cp .env.production.example .env.production
  KEY="base64:$(openssl rand -base64 32 | tr -d '\n')"
  PASS="$(openssl rand -hex 16)"
  sed -i "s|APP_KEY=.*|APP_KEY=${KEY}|" .env.production
  sed -i "s|APP_URL=.*|APP_URL=${APP_URL}|" .env.production
  sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=${APP_URL}|" .env.production
  sed -i "s|CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=${APP_URL}|" .env.production
  sed -i "s|SANCTUM_STATEFUL_DOMAINS=.*|SANCTUM_STATEFUL_DOMAINS=${PUBLIC_IP}|" .env.production
  sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=${PASS}|" .env.production
  echo "==> Fichier .env.production créé"
else
  echo "==> .env.production existe déjà (non écrasé)"
fi

echo "==> Construction des images (LibreOffice : 15 à 40 min la première fois)"
sudo docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

echo
echo "SignFlow est lancé."
echo "Ouvrez : ${APP_URL}/"
echo "Compte démo : youssouf@signflow.local  /  password"
echo
echo "Si la page ne s'affiche pas : dans Oracle, Ingress Rules du VCN,"
echo "ajoutez TCP 80 (et 443) depuis 0.0.0.0/0 — le pare-feu Oracle est distinct de Ubuntu."
