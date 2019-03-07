const express = require('express');
const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');
const shortid = require('shortid');
const db = require('../lib/db');
const attendant = require('../lib/attendant');
const executor = require('../lib/executor');

dayjs.extend(relativeTime);

const router = express.Router();

router.get('/', (req, res) => {
  const schedules = db.getCollection('schedules').data;

  schedules.forEach((schedule) => {
    const fmtDashboards = schedule.dashboards.map(board => board.displayName).join(', ');
    const createdLabel = dayjs(schedule.created).fromNow();
    Object.assign(schedule, { fmtDashboards, createdLabel });

    if (schedule.nextRunTime) {
      const nextRunTimeLabel = dayjs(schedule.nextRunTime).fromNow();
      Object.assign(schedule, { nextRunTimeLabel });
    }

    if (schedule.lastRunTime) {
      const lastRunTimeLabel = dayjs(schedule.lastRunTime).fromNow();
      Object.assign(schedule, { lastRunTimeLabel });
    }
  });

  res.render('schedules', { schedules });
});

router.get('/create', (req, res) => {
  const dashboards = db.getCollection('dashboards');
  const userGroups = db.getCollection('userGroups');

  const sortUserGroups = userGroups.chain().simplesort('displayName').data();
  const sortedDashboards = dashboards.chain().simplesort('displayName').data();

  res.render('schedules/create', { userGroups: sortUserGroups, dashboards: sortedDashboards });
});

router.post('/create', (req, res) => {
  const schedules = db.getCollection('schedules');
  const dashboards = db.getCollection('dashboards');
  const userGroups = db.getCollection('userGroups');

  try {
    // gather principle data
    const data = req.body;
    data.id = shortid();
    data.user_id = req.user.id;
    data.created = new Date();

    // coerce the ids into arrays
    const dashboardIds = [].concat(data['dashboard-ids']);
    delete data['dashboard-ids'];

    // add dashboards info from the database
    data.dashboards = dashboards.where(dash => dashboardIds.includes(dash.id));

    // get the full user group associated with the value
    data.userGroup = userGroups.findOne({ id: data.userGroupId });

    schedules.insert(data);

    req.flash('success', 'Successfully created a schedule.');
    res.redirect('/schedules');
  } catch (e) {
    req.flash('error', 'An error occurred!'.concat(e.toString()));
    res.redirect('/schedules/create');
  }
});

router.get('/:id/details', (req, res) => {
  const schedule = db.getCollection('schedules').findOne({ id: req.params.id });
  res.render('schedules/details', { schedule });
});

router.get('/:id/delete', (req, res) => {
  const schedules = db.getCollection('schedules');

  schedules.findAndRemove({ id: req.params.id });

  req.flash('success', `Successfully removed schedule with id ${req.params.id}`);
  res.redirect('/schedules');

  // queue a rescan of the fields in the database
  attendant.flush();
});

// trigger the schedule
router.get('/:id/trigger', (req, res) => {
  const schedule = db.getCollection('schedules').findOne({ id: req.params.id });
  executor.runScheduledTask(schedule);
  res.redirect('details');
});

module.exports = router;
