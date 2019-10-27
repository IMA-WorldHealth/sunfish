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
const debug = require('debug')('sunfish:cron');
const dayjs = require('dayjs');
const db = require('./db');
const executor = require('./executor');

const POLL_FREQUENCY = (16 * 60 * 60 * 1000);
const timestamp = () => dayjs().format('YYYY-MM-DD HH:mm:ss');
const queue = new Map();

cron.debug(debug);

const dashboardQuery = `
  SELECT * FROM dashboards JOIN schedules_dashboards
  ON dashboards.id = schedules_dashboards.dashboard_id
  WHERE schedules_dashboards.schedule_id = ?
`;

const queries = {
  schedules: db.prepare(`
    SELECT s.id, s.subject, s.body, s.cron, s.group_id, s.is_running, s.created_at, g.display_name
    FROM schedules s JOIN groups g ON s.group_id = g.id
    WHERE s.paused <> 1;
  `),
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
  debug('Waking up to run schedule: %j', schedule);

  const task = queue.get(schedule.id);
  if (!task) { return; }

  schedule.dashboards = queries.dashboards.all(schedule.id);

  try {
    // compute the previous and next runs
    db.prepare('UPDATE schedules SET is_running = 1 WHERE id = ?')
      .run(schedule.id);

    await executor.runScheduledTask(schedule);

    // compute the previous and next runs
    db.prepare('UPDATE schedules SET is_running = 0 WHERE id = ?')
      .run(schedule.id);
  } catch (err) {
    debug('An error occurred in the schedule. (%s)', schedule.id);
    debug('err:', err);
  }
}


/**
 * @function refreshAllSchedules
 *
 * @description
 * Clears all queued schedules and re-generates from the information
 * stored in the database.
 */
function refreshAllSchedules() {
  debug('Refreshing all schedules.');

  const tasks = Array.from(queue.values());

  debug(`Current queue size is : ${queue.size}.`);

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

  debug(`After refresh schedules, queue size is: ${queue.size}.`);
}

function main() {
  refreshAllSchedules();
  setInterval(() => refreshAllSchedules(), POLL_FREQUENCY);
}

main();

exports.refreshAllSchedules = refreshAllSchedules;
