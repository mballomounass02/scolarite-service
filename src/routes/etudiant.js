const express = require("express");
const path = require("path");
const fs = require("fs");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { pool } = require("../config/db");
const { requireRole } = require("../middleware/auth");
const { upload, uploadRoot } = require("../middleware/upload");

const router = express.Router();
router.use(requireRole("etudiant"));

router.get("/", async (req, res, next) => {
  try {
    const [dossiers] = await pool.execute(
      "SELECT d.*, (SELECT COUNT(*) FROM pieces p WHERE p.dossier_id=d.id) AS nb_pieces FROM dossiers d WHERE d.etudiant_id=? ORDER BY d.created_at DESC",
      [req.session.user.id]
    );
    res.render("etudiant/dashboard", { title: "Mon espace étudiant", dossiers });
  } catch (e) { next(e); }
});

router.get("/nouveau-dossier", async (req, res, next) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM etudiants WHERE id=?", [req.session.user.id]);
    res.render("etudiant/new-dossier", { title: "Nouvelle inscription", student: rows[0] });
  } catch (e) { next(e); }
});

router.post("/dossiers", async (req, res, next) => {
  try {
    const [studentRows] = await pool.execute("SELECT * FROM etudiants WHERE id=?", [req.session.user.id]);
    const student = studentRows[0];
    const annee = (req.body.annee || "").trim();
    if (!annee) {
      req.flash("error", "Veuillez indiquer l'année universitaire.");
      return res.redirect("/etudiant/nouveau-dossier");
    }
    const [existing] = await pool.execute(
      "SELECT id FROM dossiers WHERE etudiant_id=? AND annee=? LIMIT 1", [student.id, annee]
    );
    if (existing.length) {
      req.flash("error", "Un dossier existe déjà pour cette année universitaire.");
      return res.redirect("/etudiant");
    }
    const [result] = await pool.execute(
      "INSERT INTO dossiers (etudiant_id, annee, filiere, niveau) VALUES (?, ?, ?, ?)",
      [student.id, annee, student.filiere, student.niveau]
    );
    req.flash("success", "Votre dossier a été créé. Vous pouvez maintenant déposer vos pièces.");
    res.redirect(`/etudiant/dossiers/${result.insertId}`);
  } catch (e) { next(e); }
});

router.get("/dossiers/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM dossiers WHERE id=? AND etudiant_id=?", [req.params.id, req.session.user.id]
    );
    if (!rows.length) return res.status(404).render("error", { title: "Dossier introuvable", message: "Ce dossier n'existe pas." });
    const [pieces] = await pool.execute("SELECT * FROM pieces WHERE dossier_id=? ORDER BY created_at DESC", [req.params.id]);
    res.render("etudiant/dossier", { title: "Mon dossier", dossier: rows[0], pieces });
  } catch (e) { next(e); }
});

router.post("/dossiers/:id/pieces", upload.array("fichiers", 10), async (req, res, next) => {
  const files = req.files || [];
  let connection;
  try {
    const [rows] = await pool.execute(
      "SELECT id, etat FROM dossiers WHERE id=? AND etudiant_id=?",
      [req.params.id, req.session.user.id]
    );
    if (!rows.length || rows[0].etat === "validé") {
      files.forEach(file => { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); });
      req.flash("error", "Ce dossier ne peut pas recevoir de nouvelle pièce.");
      return res.redirect("/etudiant");
    }
    if (!files.length) {
      req.flash("error", "Sélectionnez au moins un fichier PDF ou JPG.");
      return res.redirect(`/etudiant/dossiers/${req.params.id}`);
    }

    const types = ["Carte d’identité", "Relevé de notes", "Photo", "Reçu de paiement", "Autre"];
    const submittedTypes = Array.isArray(req.body.types_piece)
      ? req.body.types_piece
      : req.body.types_piece ? [req.body.types_piece] : [];

    connection = await pool.getConnection();
    await connection.beginTransaction();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = types.includes(submittedTypes[i]) ? submittedTypes[i] : "Autre";
      await connection.execute(
        "INSERT INTO pieces (dossier_id, type_piece, nom_original, nom_fichier, mime_type, taille_octets, emplacement) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [req.params.id, type, file.originalname, file.filename, file.mimetype, file.size, file.path]
      );
    }
    await connection.commit();
    req.flash("success", `${files.length} fichier(s) déposé(s) avec succès.`);
    res.redirect(`/etudiant/dossiers/${req.params.id}`);
  } catch (e) {
    if (connection) await connection.rollback();
    files.forEach(file => { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); });
    next(e);
  } finally {
    if (connection) connection.release();
  }
});

router.get("/pieces/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      "SELECT p.* FROM pieces p JOIN dossiers d ON d.id=p.dossier_id WHERE p.id=? AND d.etudiant_id=?",
      [req.params.id, req.session.user.id]
    );
    if (!rows.length) return res.sendStatus(404);
    const file = path.resolve(uploadRoot, rows[0].nom_fichier);
    if (!file.startsWith(uploadRoot) || !fs.existsSync(file)) return res.sendStatus(404);
    res.download(file, rows[0].nom_original);
  } catch (e) { next(e); }
});

router.get("/dossiers/:id/attestation", async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT d.*, e.nom, e.prenom, e.numero_etudiant, e.filiere AS filiere_etudiant
       FROM dossiers d JOIN etudiants e ON e.id=d.etudiant_id
       WHERE d.id=? AND d.etudiant_id=? AND d.etat='validé'`,
      [req.params.id, req.session.user.id]
    );
    if (!rows.length) return res.status(403).send("Attestation disponible uniquement après validation du dossier.");
    const d = rows[0];
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const draw = (text, x, y, size=12, f=font, color=rgb(0.15,0.2,0.28)) =>
      page.drawText(String(text), { x, y, size, font:f, color });
    page.drawRectangle({ x:35, y:35, width:525, height:771, borderColor:rgb(0.08,0.28,0.35), borderWidth:2 });
    draw("UNIVERSITE DU SALOUM", 165, 770, 18, bold, rgb(0.06,0.25,0.32));
    draw("SERVICE DE LA SCOLARITE", 190, 746, 11, bold);
    page.drawLine({ start:{x:75,y:725}, end:{x:520,y:725}, thickness:1, color:rgb(0.78,0.82,0.84) });
    draw("ATTESTATION D'INSCRIPTION", 145, 670, 19, bold, rgb(0.06,0.25,0.32));
    draw("Le Service de la Scolarite certifie que :", 85, 610, 13);
    draw(`${d.prenom} ${d.nom}`, 85, 565, 17, bold);
    draw(`Numero etudiant : ${d.numero_etudiant}`, 85, 530, 12);
    draw(`Filiere : ${d.filiere_etudiant}`, 85, 505, 12);
    draw(`Niveau : ${d.niveau}`, 85, 480, 12);
    draw(`Annee universitaire : ${d.annee}`, 85, 455, 12);
    draw("est regulierement inscrit(e) pour l'annee universitaire indiquee ci-dessus.", 85, 400, 11);
    draw("Fait pour servir et valoir ce que de droit.", 85, 350, 11);
    draw("Le Directeur", 100, 210, 11, bold);
    draw("Le Responsable de la filiere", 350, 210, 11, bold);
    draw("Signature et cachet", 100, 155, 9);
    draw("Signature", 350, 155, 9);
    draw("Document genere par la plateforme Scolarite.", 155, 75, 9);
    const bytes = await pdf.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="attestation-${d.numero_etudiant}.pdf"`);
    res.send(Buffer.from(bytes));
  } catch (e) { next(e); }
});
module.exports = router;
