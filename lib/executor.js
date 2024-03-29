/**
 * @overview executor
 *
 * @description
 * The executor script defines and executes the schedules to be completed
 * on the schedule.
 */
const DHIS2Crawler = require('@ima-worldhealth/dhis2-crawler');
const api = require('@ima-worldhealth/dhis2-api');
const debug = require('debug')('sunfish:executor');
const EventEmitter = require('events');
const scribe = require('./scribe');
const mail = require('./mail');
const db = require('./db');

const eventer = new EventEmitter();

/**
 * @function runDHIS2CrawlTask
 *
 * @description
 * Spins up the dhis2-crawler and downloads the dashboard components.
 */
async function runDHIS2CrawlTask(schedule) {
  const { server, username, password } = db.prepare('SELECT * FROM credentials LIMIT 1;').get();
  const serverAddress = new URL(server).origin;

  eventer.emit('event', `Processing schedule ${schedule.id}.`);

  let crawler;

  try {
    debug('Starting up web crawler.');

    crawler = new DHIS2Crawler(serverAddress);

    // spin up a chrome instance.
    await crawler.startup();

    debug('Crawler has started up.');

    // log into the DHIS2 application
    // configure the crawler with the global username and password
    await crawler.login(username, password);

    const { dashboards } = schedule;

    debug('Downloading the following dashboards: %j', dashboards);

    const options = { skipGraphs : true };
    if (schedule.include_graphs) {
      options.skipGraphs = false;
    }

    const components = await crawler.downloadDashboardComponents(dashboards, options);

    debug('downloaded dashboard components');

    // terminate the chrome browser
    await crawler.shutdown();
    eventer.emit('event', 'Successfully retrieved dashboard components.');

    // return components to be used
    return components;
  } catch (err) {
    if (crawler) { await crawler.panic(); }

    // rethrow error to be caught in the parent controller
    throw err;
  }
}

/**
 * @function runRenderingTask
 *
 */
async function runRenderingTask(schedule, components, asHTML = false) {
  debug('Rendering reports.');
  const attachments = [];
  // eslint-disable-next-line
  for (const dashboard of components) {
    // eslint-disable-next-line
    const attachment = await scribe.render(dashboard.title, dashboard, asHTML);
    attachments.push(attachment);
  }

  debug('Finished rendering dashboards.');
  return attachments;
}

/**
 * @function runEmailTask
 *
 * @description
 * Composes the email based on the attachments provided
 */
async function runEmailTask(schedule, attachments) {
  debug('querying the DHIS2 API to see if what users to send to.');
  eventer.emit('event', `Asking DHIS2 for the members of ${schedule.userGroupName}`);

  // figure out which users we want to send to.
  const group = await api.userGroups.get(schedule.userGroupId);
  eventer.emit('event', `Found a total of ${group.data.users.length} members`);
  const userIds = group.data.users.map((user) => user.id);
  const users = await api.users.list({ fields : 'id,displayName,email', filter : `id:in:[${userIds.join(',')}]` });

  const names = users.data.users.map((user) => `${user.displayName} (${user.email})`);

  eventer.emit('event', `The members of ${schedule.userGroupName} are ${names.join(',')}.`);

  eventer.emit('event', `Composing an email with ${attachments.length} attachments.`);
  const email = mail.compose(schedule, attachments);

  debug('Composed email and sending...');
  const userEmailAddresses = users.data.users.map((user) => user.email);
  eventer.emit('event', `Sending email to ${userEmailAddresses.length} users.`);
  await mail.send(userEmailAddresses, schedule.subject, email, attachments);

  eventer.emit('event', 'Done!  Schedule completed successfully.');
  debug('Email sent');
}

/**
 * @function runScheduledTask
 *
 * @description
 * Spins up the puppeteer browser capture screenshots and render a PDF of
 * the DHIS2 dashboards.
 */
async function runScheduledTask(schedule) {
  debug('Running schedule with id: %s', schedule.id);

  if (schedule.is_running === 1) {
    debug(`Schedule ${schedule.subject} (${schedule.id}) is already running.`);
    debug(`Skipping ${schedule.subject} (${schedule.id})...`);
    return;
  }

  // update the schedule's running status.
  db.prepare('UPDATE schedules SET is_running = 1 WHERE id = ?').run(schedule.id);

  try {
    const components = await runDHIS2CrawlTask(schedule);
    const attachments = await runRenderingTask(schedule, components);
    await runEmailTask(schedule, attachments);
  } catch (err) {
    eventer.emit('event', `Whoops!  We hit the following error: ${err.toString()}`);
    debug(`Whoops!  We hit the following error: ${err.toString()}`);
  }

  // update the schedule's running status.
  db.prepare('UPDATE schedules SET is_running = 0 WHERE id = ?').run(schedule.id);
}

/**
 * @function testScheduledTask
 *
 * @description
 * Identical to runScheduledTask but returns the value
 */
async function testScheduledTask(schedule, asHTML = false) {
  debug('[test] running schedule with id: %s', schedule.id);

  if (schedule.is_running === 1) {
    debug(`Schedule ${schedule.subject} (${schedule.id}) is already running.`);
    debug(`Skipping ${schedule.subject} (${schedule.id})...`);
    return [];
  }

  // update the schedule's running status.
  db.prepare('UPDATE schedules SET is_running = 1 WHERE id = ?').run(schedule.id);

  let dashboards = [];

  try {
    const components = await runDHIS2CrawlTask(schedule);
    debug('finished components');
    dashboards = await runRenderingTask(schedule, components, asHTML);
    debug('finished dashboards');
  } catch (err) {
    eventer.emit('event', `[test] Whoops!  We hit the following error: ${err.toString()}`);
    debug(`[test] Whoops!  We hit the following error: ${err.toString()}`);
  }

  // update the schedule's running status.
  db.prepare('UPDATE schedules SET is_running = 0 WHERE id = ?').run(schedule.id);

  return dashboards;
}

exports.runScheduledTask = runScheduledTask;
exports.testScheduledTask = testScheduledTask;
exports.events = eventer;
