require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const flash = require("connect-flash");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const methodOverride = require("method-override");
const { pool } = require("./src/config/db");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src", "views"));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
  secret: process.env.SESSION_SECRET || "development-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 4 * 60 * 60 * 1000 }
}));
app.use(flash());
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.appVersion = process.env.APP_VERSION || "2.0.0";
  next();
});

app.get("/health", async (req, res) => {
  try { await pool.query("SELECT 1"); res.status(200).json({ status: "OK", database: "reachable" }); }
  catch { res.status(503).json({ status: "ERROR", database: "unreachable" }); }
});
app.get("/version", (req, res) => res.json({
  version: process.env.APP_VERSION || "2.0.0",
  vm: process.env.VM_NAME || "local-dev"
}));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.use("/", require("./src/routes/auth")(limiter));
app.use("/etudiant", require("./src/routes/etudiant"));
app.use("/agent", require("./src/routes/agent"));
app.use("/admin", require("./src/routes/admin"));

app.get("/", (req, res) => {
  if (!req.session.user) return res.render("home", { title: "Bienvenue" });
  const routes = { etudiant: "/etudiant", agent: "/agent", admin: "/admin" };
  res.redirect(routes[req.session.user.role] || "/connexion");
});
app.use((req, res) => res.status(404).render("error", {
  title: "Page introuvable", message: "La page demandée n'existe pas."
}));
app.use((err, req, res, next) => {
  console.error(err);
  const message = err.code === "LIMIT_FILE_SIZE"
    ? "Le fichier dépasse la limite de 5 Mo."
    : (err.message || "Une erreur est survenue.");
  req.flash("error", message);
  res.redirect("back");
});

app.listen(PORT, () => console.log(`Scolarité v2 démarré : http://localhost:${PORT}`));
