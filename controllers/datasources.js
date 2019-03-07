const router = require('express').Router();

const users = require('./users');
const userGroups = require('./userGroups');
const dashboards = require('./dashboards');

router.get('/refresh', (req, res) => {
  users.refreshUserList();
  userGroups.refreshUserGroupList();
  dashboards.refreshDashboardList();

  req.flash('success', 'DataSources refresh queued.');
  res.redirect('/schedules');
});

module.exports = router;
