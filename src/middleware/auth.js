function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) {
      req.flash("error", "Veuillez vous connecter pour continuer.");
      return res.redirect("/connexion");
    }
    if (req.session.user.role !== role) return res.status(403).render("error", {
      title: "Accès refusé", message: "Vous n'avez pas l'autorisation d'accéder à cette page."
    });
    next();
  };
}
module.exports = { requireRole };
