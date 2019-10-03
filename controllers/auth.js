const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const api = require('@ima-worldhealth/dhis2-api');
const express = require('express');

const router = express.Router();

const db = require('../lib/db');

const dashboards = require('../controllers/dashboards');
const userGroups = require('../controllers/userGroups');

function configureAPI() {
  const server = process.env.SERVER;
  const username = process.env.SU_USER;
  const password = process.env.SU_PASSWORD;

  // configure the dhis2API
  api.configure({ url: server, auth: { username, password } });

  setTimeout(() => {
    // refresh data values
    dashboards.refreshDashboardList();
    userGroups.refreshUserGroupList();
  }, 1000);
}


// make passport use the dhis2 API as an authentication agent for this app.
passport.use(new LocalStrategy((username, password, done) => {
  const stmt = db.prepare('INSERT INTO authentication (id, data) VALUES (?, ?);');
  // make sure the credentials are valid.
  api.auth.isValidCredentials(username, password)
    .then(({ data }) => {
      // clear out the old authentication information (if it exists)
      db.prepare('DELETE FROM authentication WHERE id = ?;').run(data.id);

      stmt.run(data.id, JSON.stringify(data));
      done(null, data);
    })
    .catch((err) => {
      done(null, false, { message: 'Bad username and password combination' });
    });
}));

// do not do serialization (JSON.stringify/parse)
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const { data } = db.prepare('SELECT data FROM authentication WHERE id = ?;').get(id);
  done(null, JSON.parse(data));
});

// TODO(@jniles) - move this to another place
function postLogin(req, res) {
  res.redirect('/');
}

router.post('/login',
  passport.authenticate('local', {
    failureRedirect: '/login',
    failureFlash: true,
  }), postLogin);

router.get('/login', (req, res) => {
  res.render('auth/login', { title: `Login to ${process.env.APP_NAME}` });
});

router.get('/logout', (req, res) => {
  req.logout();
  req.flash('success', 'Successfully logged out');
  res.redirect('/');
});

configureAPI();

module.exports = router;
