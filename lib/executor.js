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
 * @function runScheduledTask
 *
 * @description
 * Spins up the puppeteer browser capture screenshots and render a PDF of
 * the DHIS2 dashboards.
 */
async function runScheduledTask(schedule) {
  debug('running schedule with id: %s', schedule.id);
  debug('schedule.is_running = ', schedule.is_running);

  const { server, username, password } = db.prepare('SELECT * FROM credentials LIMIT 1;').get();

  const serverAddress = new URL(server).origin;

  eventer.emit('event', `Processing schedule ${schedule.id}.`);

  const randint = Date.now();

  // const echo = (str) => eventer.emit('event', str);
  let crawler;

  try {
    debug('Starting up web crawler.');

    crawler = new DHIS2Crawler(serverAddress);
    // spin up a chrome instance.
    await crawler.startup();

    debug('Crawler has started up.');

    // crawler.on('event', debug);

    // allow external listeners to hook into events
    // crawler.on('event', echo);

    // log into the DHIS2 application
    // configure the crawler with the global username and password
    await crawler.login(username, password);

    const { dashboards } = schedule;

    debug('Downloading the following dashboards: %j', dashboards);

    const options = { skipGraphs: true };
    if (schedule.include_graphs) {
      options.skipGraphs = false;
    }

    const components = await crawler.downloadDashboardComponents(dashboards, options);

    // terminate the chrome browser
    await crawler.shutdown();

    debug('querying the DHIS2 API to see if what users to send to.');

    eventer.emit('event', 'Successfully retrieved dashboard components.');

    eventer.emit('event', `Asking DHIS2 for the members of ${schedule.userGroupName}`);

    // figure out which users we want to send to.
    const group = await api.userGroups.get(schedule.userGroupId);
    eventer.emit('event', `Found a total of ${group.data.users.length} members`);
    const userIds = group.data.users.map((user) => user.id);
    const users = await api.users.list({ fields: 'id,displayName,email', filter: `id:in:[${userIds.join(',')}]` });

    const names = users.data.users.map((user) => `${user.displayName} (${user.email})`);

    eventer.emit('event', `The members of ${schedule.userGroupName} are ${names.join(',')}.`);

    debug('Rendering reports .');

    const attachments = [];
    // eslint-disable-next-line
    for (const dashboard of components) {
      // eslint-disable-next-line
      const attachment = await scribe.render(dashboard.title, dashboard);
      attachments.push(attachment);
    }

    debug('Finished rendering dashboards.');

    eventer.emit('event', `Composing an email with ${attachments.length} attachments.`);
    const email = mail.compose(schedule, attachments);

    debug('Composed email and sending...');
    const userEmailAddresses = users.data.users.map((user) => user.email);

    eventer.emit('event', `Sending email to ${userEmailAddresses.length} users.`);
    await mail.send(userEmailAddresses, schedule.subject, email, attachments, randint);

    eventer.emit('event', 'Done!  Schedule completed successfully.');
    debug('Email sent');

    await crawler.shutdown();
  } catch (err) {
    eventer.emit('event', `Whoops!  We hit the following error: ${err.toString()}`);

    if (crawler) {
      await crawler.panic();
    }
  }
}

exports.runScheduledTask = runScheduledTask;
exports.events = eventer;
