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
const retry = require('p-retry');
const delay = require('delay');
const db = require('./db');
const executor = require('./executor');

// const POLL_FREQUENCY = (16 * 60 * 60 * 1000);
const timestamp = () => dayjs().format('YYYY-MM-DD HH:mm:ss');
const queue = new Map();

cron.debug(debug);

const isMasterProcess = parseInt(process.env.NODE_APP_INSTANCE, 10) === 0;

// returns a random time between 1 second and 100 seconds
const randtime = () => (1 + Math.ceil(Math.random() * 100)) * 1000;

const dashboardQuery = `
  SELECT id, display_name FROM dashboards JOIN schedules_dashboards
  ON dashboards.id = schedules_dashboards.dashboard_id
  WHERE schedules_dashboards.schedule_id = ?
`;

const queries = {
  schedules : db.prepare(`
    SELECT s.id, s.subject, s.body, s.cron, s.group_id as userGroupId, s.is_running, s.include_graphs,
    s.created_at, g.display_name AS userGroupName, s.paused, s.created_at
    FROM schedules s JOIN groups g ON s.group_id = g.id
    WHERE s.paused <> 1 AND s.is_running <> 1;
  `),
  dashboards : db.prepare(dashboardQuery),
};

function trap(fn) {
  debug(`[${timestamp()}] running function`);
  return function resolver(...args) {
    return Promise.resolve(fn.apply(this, args))
      .catch((err) => {
        debug('An error occurred in the schedule. %o', err);
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

  debug('Process ID is: %s', process.env.NODE_APP_INSTANCE);

  if (!isMasterProcess) {
    debug('Process is not master process.  Exiting.');
    return;
  }

  debug('Process is master process. Running schedule.');

  const task = queue.get(schedule.id);
  if (!task) { return; }

  const dashboards = queries.dashboards.all(schedule.id)
    .map((board) => board.display_name);

  Object.assign(schedule, { dashboards });

  try {
    debug('Passing schedule (%s) to executor', schedule.id);

    await executor.runScheduledTask(schedule);

    debug('Finished running schedule: %s', schedule.id);
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

  debug(`Current queue size is : ${queue.size}.`);

  // halt all tasks
  queue.forEach((task, key) => {
    debug(`Halting task: ${key}`);
    task.stop();
  });

  // remove tasks from map
  queue.clear();

  // read tasks from the database
  const schedules = queries.schedules.all();

  // setup the task list
  schedules
    .forEach((task) => {
      const onFailedAttempt = async (err) => {
        const seconds = randtime();
        debug(`Task run failed with error: ${err}.`);
        debug(`Retrying in ${seconds} seconds..`);
        await delay(seconds);
      };

      // wrap the task in a promise that retries the schedule 5 times if failure.
      const resilientTask = () => retry(
        () => runScheduledTask(task),
        { retries : 5, onFailedAttempt },
      );

      const callback = cron({ on : task.cron }, trap(resilientTask));
      queue.set(task.id, callback);
    });

  debug(`After refresh schedules, queue size is: ${queue.size}.`);
}

function main() {
  refreshAllSchedules();
  // setInterval(() => refreshAllSchedules(), POLL_FREQUENCY);
}

main();

exports.refreshAllSchedules = refreshAllSchedules;
