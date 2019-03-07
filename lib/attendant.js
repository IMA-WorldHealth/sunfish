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

const cron = require('cron-scheduler');
const debug = require('debug')('cron');
const dayjs = require('dayjs');
const db = require('./db');
const executor = require('./executor');

const POLL_FREQUENCY = 10000;
const timestamp = () => dayjs().format('YYYY-MM-DD HH:mm:ss');
const queue = new Map();

cron.debug(debug);

function trap(fn) {
  debug(`[${timestamp()}] running function`);
  return function resolver(...args) {
    return Promise.resolve(fn.apply(this, args))
      .catch((err) => {
        debug('An error occurred in the schedule.');
        console.error(err);
      });
  };
}

// adds a task to the queue
function enqueue(schedule) {
  // eslint-disable-next-line
  const task = cron({ on: schedule.cron }, trap(setupNewSchedule(schedule)));
  queue.set(schedule.id, task);
}

// removes a task from the queue by calling the
// stop function, and then deleting it.
function dequeue(id) {
  const task = queue.get(id);
  task.stop();
  queue.delete(id);
}

// updates a schedule by remove it and reinstantiating it.
function update(schedule) {
  dequeue(schedule.id);
  enqueue(schedule);

  // write changes to disk
  const schedules = db.getCollection('schedules');
  // eslint-disable-next-line
  schedule.updated = 0;
  schedules.update(schedule);
}

/**
 * @function scan
 *
 * @description
 * Reads schedules from both memory and the database and ensures
 * that they are registered as cron tasks in the queue.
 */
function scan() {
  const schedules = db.getCollection('schedules');

  // check for schedules that have been removed
  const prevScheduleIds = [...queue.keys()];
  prevScheduleIds.forEach((id) => {
    const schedule = schedules.findOne({ id });

    // if we cannot find a schedule in the database, it has been removed
    // We must dequeue it to prevent it from firing again.
    if (!schedule) {
      dequeue(id);
    }

    // the updated flag is used to denote that a schedule has changed since being
    // added the queue.
    if (schedule.updated) {
      update(schedule);
    }
  });

  // run through saved schedules and configure them if they haven't been configured
  // yet
  schedules.data.forEach((schedule) => {
    const isScheduleConfigured = queue.get(schedule.id);
    if (!isScheduleConfigured) {
      enqueue(schedule);
    }
  });
}

function updateScheduleRuntime(schedule) {
  const task = queue.get(schedule.id);
  if (!task) { return; }

  // eslint-disable-next-line
  const nextRunDate = task.next()._d;
  Object.assign(schedule, { lastRunTime: new Date() });
  Object.assign(schedule, { nextRunTime: nextRunDate });

  // update the value in the database
  db.getCollection('schedules').update(schedule);
}

/**
 * @function setupNewSchedule
 *
 * @description
 * This function actually runs the schedule callback, executing all the
 * tasks for each schedule.
 *
 * Once the task runs, it updates the lastRunTime and nextRunTime fields
 * to provide information about when the task will run.
 */
function setupNewSchedule(schedule) {
  return async () => {
    updateScheduleRuntime(schedule);
    await executor.runScheduledTask(schedule);
  };
}

function main() {
  setInterval(() => scan(), POLL_FREQUENCY);
}

main();

exports.flush = scan;
