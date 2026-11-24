const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireRole("admin"));

router.get("/", async (req, res, next) => {
  try {
    const [states] = await pool.query("SELECT etat, COUNT(*) AS total FROM dossiers GROUP BY etat");
    const [filieres] = await pool.query("SELECT filiere, COUNT(*) AS total FROM dossiers GROUP BY filiere ORDER BY total DESC");
    const [counts] = await pool.query("SELECT (SELECT COUNT(*) FROM etudiants) AS etudiants, (SELECT COUNT(*) FROM agents) AS agents, (SELECT COUNT(*) FROM dossiers) AS dossiers");
    res.render("admin/dashboard", { title: "Administration", states, filieres, counts: counts[0] });
  } catch (e) { next(e); }
});

router.get("/agents", async (req, res, next) => {
  try {
    const [agents] = await pool.query("SELECT id, nom, prenom, email, actif, created_at FROM agents ORDER BY created_at DESC");
    res.render("admin/agents", { title: "Gestion des agents", agents });
  } catch (e) { next(e); }
});

router.post("/agents", async (req, res, next) => {
  try {
    const { nom, prenom, email, password } = req.body;
    if (!nom || !prenom || !email || !password || password.length < 8) {
      req.flash("error", "Renseignez tous les champs. Le mot de passe doit contenir au moins 8 caractères.");
      return res.redirect("/admin/agents");
    }
    const hash = await bcrypt.hash(password, 12);
    await pool.execute("INSERT INTO agents (nom, prenom, email, password_hash) VALUES (?, ?, ?, ?)",
      [nom.trim(), prenom.trim(), email.trim().toLowerCase(), hash]);
    req.flash("success", "Compte agent créé.");
    res.redirect("/admin/agents");
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") { req.flash("error", "Cette adresse e-mail est déjà utilisée."); return res.redirect("/admin/agents"); }
    next(e);
  }
});
module.exports = router;
