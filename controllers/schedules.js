const express = require('express');
const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');
const shortid = require('shortid');
const cronparser = require('cron-parser');
const db = require('../lib/db');
const attendant = require('../lib/attendant');
const executor = require('../lib/executor');

dayjs.extend(relativeTime);

const queries = {
  schedules: db.prepare('SELECT * FROM schedules ORDER BY created_at;'),
  dashboards: db.prepare('SELECT * FROM dashboards ORDER BY display_name;'),
  groups: db.prepare('SELECT * FROM groups ORDER BY display_name;'),
};

const router = express.Router();

router.get('/', (req, res) => {
  const schedules = queries.schedules.all();
  const dashboards = db.prepare('SELECT * FROM dashboards');

  schedules.forEach((schedule) => {
    const fmtDashboards = schedule.dashboards.map((board) => board.display_name).join(', ');
    const createdLabel = dayjs(schedule.created).fromNow();
    Object.assign(schedule, { fmtDashboards, createdLabel });

    // assign the next run time by parsing the cron
    const parsed = cronparser.parseExpression(schedule.cron);
    const nextRunTimeDate = parsed.next().toDate();
    const nextRunTimeLabel = dayjs(nextRunTimeDate).fromNow();
    Object.assign(schedule, { nextRunTimeLabel, nextRunTime: nextRunTimeDate });

    // add in last runtime if exists
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

  // try parsing the cron syntax.
  try {
    cronparser.parseExpression(req.body.cron);
  } catch (e) {
    req.flash('error', req.t('ERRORS.CRON', { cron: req.body.cron }));
    res.redirect('/schedules/create');
    return;
  }

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
    data.dashboards = dashboards.where((dash) => dashboardIds.includes(dash.id));

    // get the full user group associated with the value
    data.userGroup = userGroups.findOne({ id: data.userGroupId });

    schedules.insert(data);

    req.flash('success', req.t('SCHEDULES.CREATE_SUCCESS', data));
    res.redirect('/schedules');
  } catch (e) {
    req.flash('error', req.t('ERRORS.GENERIC', e));
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

  req.flash('success', req.t('SCHEDULES.DELETE_SUCCESS'));
  res.redirect('/schedules');

  // queue a rescan of the fields in the database
  attendant.refreshAllSchedules();
});

// trigger the schedule
router.get('/:id/trigger', (req, res) => {
  const schedule = db.getCollection('schedules').findOne({ id: req.params.id });
  executor.runScheduledTask(schedule);
  res.redirect('details');
});


router.get('/:id/pause', (req, res) => {
  const schedule = db.getCollection('schedules').findOne({ id: req.params.id });
  schedule.paused = !schedule.paused;

  req.flash('success', schedule.paused ? req.t('SCHEDULES.PAUSE_SUCCESS') : req.t('SCHEDULES.UNPAUSE_SUCCESS'));
  res.redirect('/schedules');

  // queue a rescan of the fields in the database
  attendant.flush();
});

module.exports = router;
