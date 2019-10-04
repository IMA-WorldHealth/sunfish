const express = require('express');
const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');
const { parseExpression } = require('cron-parser');
const db = require('../lib/db');
const attendant = require('../lib/attendant');
const executor = require('../lib/executor');

dayjs.extend(relativeTime);

const queries = {
  schedules: db.prepare(`
    SELECT s.id, s.subject, s.cron, g.display_name as userGroupName, s.group_id AS userGroupId,
      GROUP_CONCAT(d.display_name) as dashboards, s.paused, s.created_at
    FROM schedules s JOIN groups g ON s.group_id = g.id
      JOIN schedules_dashboards sd ON s.id = sd.schedule_id
      JOIN dashboards d ON sd.dashboard_id = d.id
    GROUP BY s.id
    ORDER BY s.created_at;
  `),
  schedule: db.prepare(`
    SELECT s.id, s.subject, s.cron, s.body, g.display_name as userGroupName, s.group_id AS userGroupId,
      GROUP_CONCAT(d.display_name) as dashboards, s.paused, s.created_at
    FROM schedules s JOIN groups g ON s.group_id = g.id
      JOIN schedules_dashboards sd ON s.id = sd.schedule_id
      JOIN dashboards d ON sd.dashboard_id = d.id
    WHERE s.id = ?
    GROUP BY s.id
    ORDER BY s.created_at;
  `),
  dashboards: db.prepare('SELECT * FROM dashboards ORDER BY display_name;'),
  groups: db.prepare('SELECT * FROM groups ORDER BY display_name;'),
};

const router = express.Router();

router.get('/', (req, res) => {
  const schedules = queries.schedules.all();

  schedules.forEach((schedule) => {
    const createdLabel = dayjs(schedule.created_at).fromNow();
    Object.assign(schedule, { createdLabel });

    // assign the next run time by parsing the cron
    const parsed = parseExpression(schedule.cron);
    const nextRunTimeDate = parsed.next().toDate();
    const nextRunTimeLabel = dayjs(nextRunTimeDate).fromNow();

    const parsed2 = parseExpression(schedule.cron);
    const prevRunTimeDate = parsed2.prev().toDate();
    const prevRunTimeLabel = dayjs(prevRunTimeDate).fromNow();

    Object.assign(schedule, { nextRunTimeLabel, nextRunTime: nextRunTimeDate });
    Object.assign(schedule, { prevRunTimeLabel, prevRunTime: prevRunTimeDate });
  });

  res.render('schedules', { schedules });
});

router.get('/create', (req, res) => {
  const dashboards = queries.dashboards.all();
  const userGroups = queries.groups.all();

  res.render('schedules/create', { userGroups, dashboards });
});

router.post('/create', (req, res) => {
  // try parsing the cron syntax.
  try {
    parseExpression(req.body.cron);
  } catch (e) {
    req.flash('error', req.t('ERRORS.CRON', { cron: req.body.cron }));
    res.redirect('/schedules/create');
    return;
  }


  try {
    // gather principle data
    const data = req.body;
    data.user_id = req.user.id;

    // coerce the ids into arrays
    const dashboardIds = [].concat(data['dashboard-ids']);
    delete data['dashboard-ids'];

    const createScheduleStatement = db.prepare(`INSERT INTO schedules
      (subject, body, group_id, cron, is_running, paused)
      VALUES (@subject, @body, @group_id, @cron, FALSE, FALSE);
    `);

    const linkDashboardStatement = db.prepare('INSERT INTO schedules_dashboards (schedule_id, dashboard_id) VALUES (?, ?);');

    const txn = db.transaction(() => {
      const { lastInsertRowid } = createScheduleStatement.run(data);

      dashboardIds.forEach((dashboardId) => {
        linkDashboardStatement.run(lastInsertRowid, dashboardId);
      });
    });

    txn();

    req.flash('success', req.t('SCHEDULES.CREATE_SUCCESS', data));
    res.redirect('/schedules');
  } catch (e) {
    req.flash('error', req.t('ERRORS.GENERIC', e));
    res.redirect('/schedules/create');
  }
});

router.get('/:id/details', (req, res) => {
  const schedule = queries.schedule.get(req.params.id);
  schedule.dashboards = schedule.dashboards.split(',');

  res.render('schedules/details', { schedule });
});

router.get('/:id/delete', (req, res) => {
  db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);

  req.flash('success', req.t('SCHEDULES.DELETE_SUCCESS'));
  res.redirect('/schedules');

  // queue a rescan of the fields in the database
  attendant.refreshAllSchedules();
});

// trigger the schedule
router.get('/:id/trigger', (req, res) => {
  const schedule = queries.schedule.get(req.params.id);

  schedule.dashboards = schedule.dashboards.split(',');

  executor.runScheduledTask(schedule);
  res.redirect('details');
});


router.get('/:id/pause', (req, res) => {
  const schedule = queries.schedule.get(req.params.id);
  const toggle = Number(!schedule.paused);
  db.prepare('UPDATE schedules SET paused = ? WHERE id = ?')
    .run(toggle, req.params.id);

  req.flash('success', toggle ? req.t('SCHEDULES.PAUSE_SUCCESS') : req.t('SCHEDULES.UNPAUSE_SUCCESS'));
  res.redirect('/schedules');

  // queue a rescan of the fields in the database
  attendant.refreshAllSchedules();
});

module.exports = router;
