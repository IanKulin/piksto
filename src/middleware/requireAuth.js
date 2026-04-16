export default function requireAuth(req, res, next) {
  if (!req.session.authenticated) {
    return res.redirect("/login");
  }
  res.locals.user = req.session.username;
  next();
}
