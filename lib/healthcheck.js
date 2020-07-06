const db = require('./db');

/**
 * @function isInstalled
 *
 * @description
 * Returns true if credentials are configured for the user DHIS2 API.
 */
function isInstalled() {
  const creds = db.prepare('SELECT server, username FROM credentials LIMIT 1')
    .get();

  const hasServer = creds && creds.server && creds.server.length > 0;
  const hasUser = creds && creds.username && creds.username.length > 0;

  return hasServer && hasUser;
}

exports.isInstalled = isInstalled;
