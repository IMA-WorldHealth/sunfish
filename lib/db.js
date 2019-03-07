const Loki = require('lokijs');

const appName = process.env.APP_NAME;

const db = new Loki(`${appName}.db`, {
  autoload: true,
  // eslint-disable-next-line
  autoloadCallback: init,
  autosave: true,
  autosaveInterval: 4000,
});

function initCollectionIfNonExistant(name) {
  const entries = db.getCollection(name);
  if (entries === null) {
    db.addCollection(name);
  }
}

function init() {
  initCollectionIfNonExistant('authentication', { unique: ['id'] });
  initCollectionIfNonExistant('users', { unique: ['id'] });
  initCollectionIfNonExistant('dashboards', { unique: ['id'] });
  initCollectionIfNonExistant('schedules', { unique: ['id'] });
  initCollectionIfNonExistant('userGroups', { unique: ['id'] });
}

module.exports = db;
