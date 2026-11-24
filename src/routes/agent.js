const express = require("express");
const path = require("path");
const fs = require("fs");
const { pool } = require("../config/db");
const { requireRole } = require("../middleware/auth");
const { uploadRoot } = require("../middleware/upload");

const router = express.Router();
router.use(requireRole("agent"));

router.get("/", async (req, res, next) => {
  try {
    const etat = req.query.etat || "";
    const filiere = req.query.filiere || "";
    const where = [];
    const params = [];
    if (["en attente","validé","rejeté"].includes(etat)) { where.push("d.etat=?"); params.push(etat); }
    if (filiere) { where.push("d.filiere=?"); params.push(filiere); }
    const sql = `SELECT d.*, e.nom, e.prenom, e.numero_etudiant
      FROM dossiers d JOIN etudiants e ON e.id=d.etudiant_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY d.created_at DESC`;
    const [dossiers] = await pool.execute(sql, params);
    const [filieres] = await pool.query("SELECT DISTINCT filiere FROM dossiers ORDER BY filiere");
    res.render("agent/dashboard", { title: "Espace agent", dossiers, filieres: filieres.map(x=>x.filiere), filters:{etat,filiere} });
  } catch (e) { next(e); }
});

router.get("/dossiers/:id", async (req, res, next) => {
  try {
    const [dossiers] = await pool.execute(
      "SELECT d.*, e.nom, e.prenom, e.numero_etudiant, e.email FROM dossiers d JOIN etudiants e ON e.id=d.etudiant_id WHERE d.id=?",
      [req.params.id]
    );
    if (!dossiers.length) return res.sendStatus(404);
    const [pieces] = await pool.execute("SELECT * FROM pieces WHERE dossier_id=? ORDER BY created_at", [req.params.id]);
    res.render("agent/dossier", { title: "Examen du dossier", dossier: dossiers[0], pieces });
  } catch (e) { next(e); }
});

router.get("/pieces/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM pieces WHERE id=?", [req.params.id]);
    if (!rows.length) return res.sendStatus(404);
    const file = path.resolve(uploadRoot, rows[0].nom_fichier);
    if (!file.startsWith(uploadRoot) || !fs.existsSync(file)) return res.sendStatus(404);
    res.download(file, rows[0].nom_original);
  } catch (e) { next(e); }
});

router.post("/dossiers/:id/decision", async (req, res, next) => {
  try {
    const etat = req.body.etat;
    if (!["en attente","validé","rejeté"].includes(etat)) {
      req.flash("error", "Décision invalide.");
      return res.redirect(`/agent/dossiers/${req.params.id}`);
    }
    await pool.execute(
      "UPDATE dossiers SET etat=?, commentaire=?, traite_par=? WHERE id=?",
      [etat, (req.body.commentaire || "").trim() || null, req.session.user.id, req.params.id]
    );
    req.flash("success", "Décision enregistrée.");
    res.redirect(`/agent/dossiers/${req.params.id}`);
  } catch (e) { next(e); }
});
module.exports = router;
