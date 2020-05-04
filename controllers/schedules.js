const express = require('express');
const dayjs = require('dayjs');
const debug = require('debug')('sunfish:schedules');
const relativeTime = require('dayjs/plugin/relativeTime');
const { parseExpression } = require('cron-parser');
const db = require('../lib/db');
const attendant = require('../lib/attendant');
const executor = require('../lib/executor');

const { refreshDashboardList } = require('./dashboards');
const { refreshUserGroupList } = require('./userGroups');

dayjs.extend(relativeTime);

const queries = {
  schedules: db.prepare(`
    SELECT s.id, s.subject, s.cron, g.display_name as userGroupName, s.group_id AS userGroupId,
      s.include_graphs,
      GROUP_CONCAT(d.display_name) as dashboards, s.paused, s.created_at
    FROM schedules s JOIN groups g ON s.group_id = g.id
      JOIN schedules_dashboards sd ON s.id = sd.schedule_id
      JOIN dashboards d ON sd.dashboard_id = d.id
    GROUP BY s.id
    ORDER BY s.created_at;
  `),
  schedule: db.prepare(`
    SELECT s.id, s.subject, s.cron, s.body, g.display_name as userGroupName, s.group_id AS userGroupId,
      s.include_graphs, GROUP_CONCAT(sd.dashboard_id) as dashboardIds,
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

router.get('/refresh', async (req, res) => {
  debug('Refreshing dashboards and user groups...');

  await Promise.all([
    refreshDashboardList(),
    refreshUserGroupList(),
  ]);

  debug('Dashboards and user groups refreshed.');

  res.redirect('back');
});

router.post('/create', (req, res) => {
  // try parsing the cron syntax.
  try {
    parseExpression(req.body.cron);
  } catch (e) {
    req.flash('error', req.t('ERRORS.CRON', { cron: req.body.cron }));
    res.redirect('back');
    return;
  }

  try {
    // gather principle data
    const data = req.body;
    data.user_id = req.user.id;

    // coerce the ids into arrays
    const dashboardIds = [].concat(data['dashboard-ids']);
    delete data['dashboard-ids'];

    data.include_graphs = parseInt(data.include_graphs, 10);

    const createScheduleStatement = db.prepare(`INSERT INTO schedules
      (subject, body, group_id, cron, is_running, paused, include_graphs)
      VALUES (@subject, @body, @group_id, @cron, FALSE, FALSE, @include_graphs);
    `);

    const linkDashboardStatement = db.prepare('INSERT INTO schedules_dashboards (schedule_id, dashboard_id) VALUES (?, ?);');

    const txn = db.transaction(() => {
      const { lastInsertRowid } = createScheduleStatement.run(data);

      dashboardIds.forEach((dashboardId) => {
        linkDashboardStatement.run(lastInsertRowid, dashboardId);
      });
    });

    txn();

    attendant.refreshAllSchedules();

    req.flash('success', req.t('SCHEDULES.CREATE_SUCCESS', data));
    res.redirect('/schedules');
  } catch (e) {
    req.flash('error', req.t('ERRORS.GENERIC', e));
    res.redirect('back');
  }
});

router.post('/:id/edit', (req, res) => {
  // try parsing the cron syntax.
  try {
    parseExpression(req.body.cron);
  } catch (e) {
    req.flash('error', req.t('ERRORS.CRON', { cron: req.body.cron }));
    res.redirect('back');
    return;
  }

  try {
    // gather principle data
    const data = req.body;
    data.id = req.params.id;

    // coerce the ids into arrays
    const dashboardIds = [].concat(data['dashboard-ids']);
    delete data['dashboard-ids'];

    data.include_graphs = parseInt(data.include_graphs, 10);

    const updateScheduleStatement = db.prepare(`UPDATE schedules SET
      subject = @subject, body = @body, group_id = @group_id,
      cron = @cron, include_graphs = @include_graphs
      WHERE id = @id;`);

    const clearDashboardStatement = db.prepare('DELETE FROM schedules_dashboards WHERE schedule_id = ?;');
    const linkDashboardStatement = db.prepare('INSERT INTO schedules_dashboards (schedule_id, dashboard_id) VALUES (?, ?);');

    const txn = db.transaction(() => {
      updateScheduleStatement.run(data);

      clearDashboardStatement.run(data.id);

      dashboardIds.forEach((dashboardId) => {
        linkDashboardStatement.run(data.id, dashboardId);
      });
    });

    txn();

    attendant.refreshAllSchedules();

    req.flash('success', req.t('SCHEDULES.EDIT_SUCCESS', data));
    res.redirect('/schedules');
  } catch (e) {
    req.flash('error', req.t('ERRORS.GENERIC', e));
    res.redirect('back');
  }
});

router.get('/:id/details', (req, res) => {
  const schedule = queries.schedule.get(req.params.id);
  schedule.dashboards = schedule.dashboards.split(',');

  res.render('schedules/details', { schedule });
});

router.get('/:id/edit', (req, res) => {
  const schedule = queries.schedule.get(req.params.id);
  schedule.dashboards = schedule.dashboards.split(',');

  const dashboards = queries.dashboards.all();
  const userGroups = queries.groups.all();

  res.render('schedules/edit', { schedule, dashboards, userGroups });
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
