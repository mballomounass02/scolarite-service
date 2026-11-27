const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");

module.exports = (limiter) => {
  const router = express.Router();
  const roleRoutes = { etudiant: "/etudiant", agent: "/agent", admin: "/admin" };

  router.get("/connexion", (req, res) => res.render("auth/login", { title: "Connexion" }));
  router.post("/connexion", limiter, async (req, res, next) => {
    try {
      const { email, password } = req.body;
      if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
        req.flash("error", "Veuillez vérifier les informations saisies.");
        return res.redirect("/connexion");
      }

      const [accounts] = await pool.execute(
        `SELECT id, nom, prenom, email, password_hash, 'etudiant' AS role
           FROM etudiants WHERE email = ? AND actif = 1
         UNION ALL
         SELECT id, nom, prenom, email, password_hash, 'agent' AS role
           FROM agents WHERE email = ? AND actif = 1
         UNION ALL
         SELECT id, nom, prenom, email, password_hash, 'admin' AS role
           FROM administrateurs WHERE email = ? AND actif = 1`,
        [email.trim().toLowerCase(), email.trim().toLowerCase(), email.trim().toLowerCase()]
      );
      const matchingAccounts = [];
      for (const account of accounts) {
        if (await bcrypt.compare(password, account.password_hash)) matchingAccounts.push(account);
      }

      if (matchingAccounts.length !== 1) {
        req.flash("error", "Adresse e-mail ou mot de passe incorrect.");
        return res.redirect("/connexion");
      }
      const account = matchingAccounts[0];
      req.session.user = {
        id: account.id, nom: account.nom, prenom: account.prenom,
        email: account.email, role: account.role
      };
      res.redirect(roleRoutes[account.role]);
    } catch (err) { next(err); }
  });

  router.get("/inscription", (req, res) => res.render("auth/register", { title: "Créer un compte étudiant" }));
  router.post("/inscription", async (req, res, next) => {
    try {
      const { numero_etudiant, nom, prenom, email, filiere, niveau, password, password_confirm } = req.body;
      if (!numero_etudiant || !nom || !prenom || !email || !filiere || !niveau || !password) {
        req.flash("error", "Tous les champs sont obligatoires.");
        return res.redirect("/inscription");
      }
      if (password.length < 8 || password !== password_confirm) {
        req.flash("error", "Le mot de passe doit contenir au moins 8 caractères et les deux saisies doivent correspondre.");
        return res.redirect("/inscription");
      }
      const hash = await bcrypt.hash(password, 12);
      await pool.execute(
        "INSERT INTO etudiants (numero_etudiant, nom, prenom, email, password_hash, filiere, niveau) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [numero_etudiant.trim(), nom.trim(), prenom.trim(), email.trim().toLowerCase(), hash, filiere.trim(), niveau.trim()]
      );
      req.flash("success", "Compte créé. Vous pouvez maintenant vous connecter.");
      res.redirect("/connexion");
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        req.flash("error", "Ce numéro étudiant ou cette adresse e-mail est déjà utilisé.");
        return res.redirect("/inscription");
      }
      next(err);
    }
  });

  router.post("/deconnexion", (req, res) => req.session.destroy(() => res.redirect("/")));
  return router;
};
