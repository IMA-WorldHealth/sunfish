const router = require('express').Router();
const api = require('@ima-worldhealth/dhis2-api');
const debug = require('debug')('sunfish:setup');
const db = require('../lib/db');

const dashboards = require('./dashboards');
const userGroups = require('./userGroups');

/**
 * @function setup
 * @method GET
 *
 * @description
 * Renders the setup/configuration page for the application.  This will
 * only be run on the first installation to set up the DHIS2 username,
 * password and web API target.
 */
router.get('/', (req, res) => {
  res.render('setup.pug');
});

/**
 * @function setup
 * @method POST
 *
 * @description
 * Receives the setup from the client, tests it, and writes it the
 * database if DHIS2 accepts the credentials.
 */
router.post('/', async (req, res) => {
  const { server, username, password } = req.body;
  api.configure({ url: server });

  debug('Setting credentials for API');
  try {
    await api.auth.isValidCredentials(username, password);

    debug('Credentials accepted.');

    // login successful, register the credentials with the API
    api.configure({ url: server, auth: { username, password } });

    db.prepare('DELETE FROM credentials;').run();
    db.prepare('INSERT INTO credentials (username, password, server) VALUES (?, ?, ?);')
      .run(username, password, server);

    debug('Credentials saved.');

    setTimeout(() => {
      // refresh data values
      dashboards.refreshDashboardList();
      userGroups.refreshUserGroupList();
    }, 200);

    req.flash('info', req.t('INSTALL.SUCCESS', { server, username }));
    res.redirect('/');
  } catch (error) {
    // if an error is thrown, it means that the API does not have
    // valid credentials.  We must inform the user to try again.

    debug('An error occurred:', error);

    req.flash('error', req.t('INSTALL.ERROR', error));
    res.redirect('/setup');
  }
});

module.exports = router;
