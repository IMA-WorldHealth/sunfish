const api = require('@ima-worldhealth/dhis2-api');
const router = require('express').Router();
const db = require('../lib/db');

async function refreshDashboardList() {
  const dashboards = db.getCollection('dashboards');
  const { data } = await api.dashboards.list();

  dashboards.clear();
  dashboards.insert(data.dashboards);

  return data.dashboards;
}

router.get('/', (req, res) => {
  const { data } = db.getCollection('dashboards');
  res.render('data-list', { data, header: 'Dashboards' });
});

module.exports = router;
module.exports.refreshDashboardList = refreshDashboardList;
