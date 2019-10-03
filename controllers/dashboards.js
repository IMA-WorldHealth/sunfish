const api = require('@ima-worldhealth/dhis2-api');
const router = require('express').Router();
const db = require('../lib/db');

async function refreshDashboardList() {
  const { data } = await api.dashboards.list();

  // clear out the old dashboards
  db.prepare('DELETE FROM dashboards;').run();

  const insert = db.prepare('INSERT INTO dashboards (id, display_name) VALUES (?, ?)');

  const bulk = db.transaction((boards) => {
    boards.forEach((board) => {
      insert.run(board.id, board.displayName);
    });
  });

  // perform a bulk insert of all dashbaords
  bulk(data.dashboards);

  return data.dashboards;
}

router.get('/', (req, res) => {
  const data = db.prepare('SELECT * FROM dashboards;').all();
  res.render('data-list', { data, header: 'Dashboards' });
});

module.exports = router;
module.exports.refreshDashboardList = refreshDashboardList;
