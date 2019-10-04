const api = require('@ima-worldhealth/dhis2-api');
const router = require('express').Router();
const db = require('../lib/db');

async function refreshUserGroupList() {
  const { data } = await api.userGroups.list();

  // clear out the old dashboards
  db.prepare('DELETE FROM groups WHERE id NOT IN (SELECT group_id FROM schedules);').run();

  const insert = db.prepare('INSERT OR IGNORE INTO groups (id, display_name) VALUES (?, ?)');

  const bulk = db.transaction((groups) => {
    groups.forEach((group) => {
      insert.run(group.id, group.displayName);
    });
  });

  // perform a bulk insert of all user groups
  bulk(data.userGroups);

  return data.userGroups;
}

router.get('/', (req, res) => {
  const { data } = db.prepare('SELECT * FROM groups;').all();
  res.render('data-list', { data, header: 'User Groups' });
});

module.exports = router;
module.exports.refreshUserGroupList = refreshUserGroupList;
