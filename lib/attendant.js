/**
 * @overview attendant
 *
 * @description
 * This module is the heart and soul of the entire application.  It monitors
 * the database for changes to the schedules table and ensures that schedules
 * are enacted soon after they are created.  A schedule will consist of a
 * trigger to crawl the DHIS2 web app following some dashboards, draw down
 * the tables and/or SVG images, and template them into a PDF report,
 * then compose and mail the report off to a user list.
 *
 * To alter the frequency that the database is polled to check if new schedules
 * have been made available, modify the POLL_FREQUENCY variable.
 */

const cron = require('@ima-worldhealth/cron-scheduler');
const debug = require('debug')('cron');
const dayjs = require('dayjs');
const db = require('./db');
const executor = require('./executor');

const POLL_FREQUENCY = 100000;
const timestamp = () => dayjs().format('YYYY-MM-DD HH:mm:ss');
const queue = new Map();

cron.debug(debug);

const dashboardQuery = `
  SELECT * FROM dashboards JOIN schedules_dashboards
  ON dashboards.id = schedules_dashboards.dashboard_id
  WHERE schedules_dashboards.schedule_id = ?
`;

const queries = {
  schedules: db.prepare('SELECT * FROM schedules WHERE paused <> 1;'),
  dashboards: db.prepare(dashboardQuery),
};

function trap(fn) {
  debug(`[${timestamp()}] running function`);
  return function resolver(...args) {
    return Promise.resolve(fn.apply(this, args))
      .catch((err) => {
        debug('An error occurred in the schedule. %j', err);
      });
  };
}

/**
 * @function runScheduledTask
 *
 * @description
 * Runs the selected schedule.
 */
async function runScheduledTask(schedule) {
  const task = queue.get(schedule.id);
  if (!task) { return; }

  // eslint-disable-next-line
  const nextRunTime = task.next()._d;
  const lastRunTime = new Date();

  // compute the previous and next runs
  db.prepare('UPDATE schedules SET next_run_time = ?, last_run_time = ? WHERE id = ?')
    .run(nextRunTime, lastRunTime, schedule.id);

  const timer = new Date();
  try {
    await executor.runScheduledTask(schedule);
  } catch (err) {
    debug('An error occurred in the schedule. (%s) %j', schedule.id, err);
  }

  const duration = new Date() - timer;

  // write the duration of the last run.
  db.prepare('UPDATE schedules duration = ? WHERE id = ?')
    .run(duration, schedule.id);
}


/**
 * @function refreshAllSchedules
 *
 * @description
 * Clears all queued schedules and re-generates from the information
 * stored in the database.
 */
function refreshAllSchedules() {
  const tasks = Array.from(queue.values());

  // halt all tasks
  tasks.forEach((task) => task.stop());

  // remove tasks from map
  queue.clear();

  // read tasks from the database
  const schedules = queries.schedules.all();

  // setup the task list
  schedules
    .forEach((task) => {
      const callback = cron({ on: task.cron }, trap(() => runScheduledTask(task)));
      queue.set(task.id, callback);
    });
}

function main() {
  setInterval(() => refreshAllSchedules(), POLL_FREQUENCY);
}

main();

exports.refreshAllSchedules = refreshAllSchedules;
