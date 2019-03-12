const router = require('express').Router();

const userGroups = require('./userGroups');
const dashboards = require('./dashboards');

router.get('/refresh', (req, res) => {
  userGroups.refreshUserGroupList();
  dashboards.refreshDashboardList();

  req.flash('success', 'DataSources refresh queued.');
  res.redirect('/schedules');
});

module.exports = router;
