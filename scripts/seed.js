require("dotenv").config();
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const { pool } = require("../src/config/db");

async function main() {
  const passwordHash = await bcrypt.hash("Demo@2026", 10);
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });
  const sampleName = "document-exemple-scolarite.pdf";
  const samplePath = path.join(uploadDir, sampleName);
  if (!fs.existsSync(samplePath)) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText("DOCUMENT DE DEMONSTRATION - SCOLARITE", { x: 70, y: 760, size: 18, font });
    page.drawText("Fichier fictif genere pour tester le depot et le telechargement.", { x: 70, y: 720, size: 11, font });
    fs.writeFileSync(samplePath, Buffer.from(await pdf.save()));
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [admins] = await conn.execute("SELECT id FROM administrateurs WHERE email='admin@scolarite.sn'");
    if (!admins.length) await conn.execute(
      "INSERT INTO administrateurs (nom, prenom, email, password_hash) VALUES ('Administrateur', 'Principal', 'admin@scolarite.sn', ?)", [passwordHash]
    );

    const agentIds = [];
    for (let i=1; i<=3; i++) {
      const email = `agent${i}@scolarite.sn`;
      const [found] = await conn.execute("SELECT id FROM agents WHERE email=?", [email]);
      let id = found[0]?.id;
      if (!id) {
        const [result] = await conn.execute(
          "INSERT INTO agents (nom, prenom, email, password_hash) VALUES (?, ?, ?, ?)",
          [`Agent${i}`, "Scolarité", email, passwordHash]
        );
        id = result.insertId;
      }
      agentIds.push(id);
    }

    const filieres = ["Informatique", "Gestion", "Droit", "Économie", "Lettres"];
    const niveaux = ["Licence 1", "Licence 2", "Licence 3", "Master 1"];
    for (let i=1; i<=500; i++) {
      const email = `etudiant${String(i).padStart(3,"0")}@demo.sn`;
      const [found] = await conn.execute("SELECT id FROM etudiants WHERE email=?", [email]);
      if (found.length) continue;
      const [result] = await conn.execute(
        "INSERT INTO etudiants (numero_etudiant, nom, prenom, email, password_hash, filiere, niveau) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [`US${String(i).padStart(6,"0")}`, `Nom${i}`, `Prenom${i}`, email, passwordHash, filieres[(i-1)%filieres.length], niveaux[(i-1)%niveaux.length]]
      );
      if (i <= 15) {
        const [dossier] = await conn.execute(
          "INSERT INTO dossiers (etudiant_id, annee, filiere, niveau, etat, traite_par, commentaire) VALUES (?, '2026-2027', ?, ?, ?, ?, ?)",
          [result.insertId, filieres[(i-1)%filieres.length], niveaux[(i-1)%niveaux.length],
            i%3===0 ? "validé" : i%3===1 ? "en attente" : "rejeté",
            i%3===0 ? agentIds[(i-1)%3] : null,
            i%3===2 ? "Veuillez compléter ou corriger les pièces demandées." : null]
        );
        if (i <= 5) {
          await conn.execute(
            "INSERT INTO pieces (dossier_id, type_piece, nom_original, nom_fichier, mime_type, taille_octets, emplacement) VALUES (?, 'Autre', 'document-exemple-scolarite.pdf', ?, 'application/pdf', ?, ?)",
            [dossier.insertId, sampleName, fs.statSync(samplePath).size, samplePath]
          );
        }
      }
    }
    await conn.commit();
    console.log("Données de démonstration créées (500 étudiants, 3 agents, 1 administrateur et dossiers d'exemple).");
    console.log("Admin : admin@scolarite.sn / Demo@2026");
    console.log("Agent : agent1@scolarite.sn / Demo@2026 (également agent2 et agent3)");
    console.log("Étudiant : etudiant001@demo.sn / Demo@2026");
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
