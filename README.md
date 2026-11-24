# Scolarité v2 — Université du Saloum

Nouvelle application Node.js + Express + EJS + MySQL, avec des tables séparées pour les étudiants et les agents.

## 1. Ce qui change dans cette version

- `etudiants` : comptes et informations des étudiants.
- `agents` : comptes des agents de scolarité.
- `dossiers` : demandes annuelles, avec `etudiant_id` vers `etudiants.id` et `traite_par` vers `agents.id`.
- `pieces` : documents déposés, liés à `dossiers.id`.
- `administrateurs` : table supplémentaire pour stocker les comptes administrateurs. Le cahier des charges impose les tables `etudiants`, `agents`, `dossiers`, `pieces`; la table `administrateurs` est un choix de conception additionnel.

L'ancienne application `scolarite-app` n'est ni modifiée ni supprimée.

## 2. Prérequis

- Node.js version 20 ou supérieure (LTS recommandé)
- MySQL 8 recommandé par le sujet
- XAMPP/phpMyAdmin peut être utilisé pour exécuter le SQL. Vérifiez la version réelle du moteur avec `SELECT VERSION();` : certaines versions de XAMPP utilisent MariaDB, et non MySQL 8.

## 3. Installation Windows

1. Décompressez le dossier `scolarite_v2` dans `C:\\projets\\`.
2. Ouvrez ce dossier dans VS Code.
3. Copiez `.env.example` et renommez la copie en `.env`.
4. Ouvrez `.env` et adaptez `DB_USER`, `DB_PASSWORD`, `DB_NAME` si nécessaire.
5. Dans phpMyAdmin, ouvrez l'onglet SQL et exécutez le contenu de `database/schema.sql`.
6. Dans le terminal VS Code, vérifiez que vous êtes dans le dossier `scolarite_v2`, puis exécutez :

```bash
npm install
npm run seed
npm run dev
```

7. Ouvrez `http://localhost:3000`.

Si le port 3000 est déjà utilisé, arrêtez proprement l'autre serveur ou changez `PORT` dans `.env` (par exemple `PORT=3001`).

## 4. Comptes de démonstration

Mot de passe commun : `Demo@2026`

- Administrateur : `admin@scolarite.sn`
- Agent : `agent1@scolarite.sn` (agent2 et agent3 sont également créés)
- Étudiant : `etudiant001@demo.sn`

Le script de seed crée 500 étudiants, 3 agents, 1 administrateur, 15 dossiers d'exemple et quelques lignes de pièces d'exemple. Un petit PDF fictif est généré dans `uploads/` pour permettre de tester le téléchargement des pièces d'exemple.

## 5. Fonctionnalités incluses

### Étudiant
- Création de compte et connexion.
- Création d'un dossier pour une année universitaire.
- Dépôt de pièces PDF/JPG de 5 Mo maximum.
- Consultation de l'état et des commentaires.
- Téléchargement d'une attestation PDF après validation.

### Agent
- Liste des dossiers.
- Filtrage par filière et état.
- Téléchargement des pièces.
- Validation ou rejet avec commentaire.

### Administrateur
- Création de comptes agents.
- Statistiques par état et filière.

### Supervision
- `/health` : répond 200 si la base est joignable, sinon 503.
- `/version` : affiche la version et le nom de la VM.

## 6. Structure de la base

```text
etudiants ──< dossiers ──< pieces
agents ─────< dossiers (traitement)
administrateurs (comptes admin)
```

## 7. Points à savoir

- Les sessions sont volontairement conservées en mémoire pour correspondre au scénario de départ du projet Cloud. En production multi-VM, il faudra traiter ce point (sticky sessions ou stockage partagé).
- Les fichiers sont stockés localement dans `uploads/` au départ. La migration vers S3 est une étape ultérieure du projet.
- Le script SQL crée une base `scolarite_v2` séparée. Il ne touche pas à votre ancienne base `scolarite`.
- Ne copiez pas votre ancien fichier `.env` dans ce dossier. Saisissez les paramètres de connexion dans le nouveau `.env`.
- Ce projet est un socle de démonstration académique : avant une mise en production réelle, ajoutez notamment une protection CSRF, une validation serveur plus stricte, une politique de conservation des fichiers et une gestion centralisée des sessions.

## 8. Vérification rapide

Après lancement :
- `http://localhost:3000/health`
- `http://localhost:3000/version`

Résultat attendu de `/health` si la base est accessible :

```json
{"status":"OK","database":"reachable"}
```
