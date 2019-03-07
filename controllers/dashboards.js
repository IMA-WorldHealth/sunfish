const api = require('@ima-worldhealth/dhis2-api');
const router = require('express').Router();
const db = require('../lib/db');

function refreshDashboardList() {
  const dashboards = db.getCollection('dashboards');
  return api.dashboards.list()
    .then(({ data }) => {
      dashboards.clear();
      dashboards.insert(data.dashboards);
      return data.dashboards;
    });
}

router.get('/', (req, res) => {
  const { data } = db.getCollection('dashboards');
  res.render('data-list', { data, header: 'Dashboards' });
});

module.exports = router;
module.exports.refreshDashboardList = refreshDashboardList;
