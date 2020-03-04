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

  const { server, username, password } = db.prepare('SELECT * FROM credentials LIMIT 1;').get();

  const serverAddress = new URL(server).origin;
  const crawler = new DHIS2Crawler(serverAddress);

  eventer.emit('event', `Processing schedule ${schedule.id}.`);

  debug('startup up web crawler');

  try {
    // spin up a chrome instance.
    await crawler.startup();

    crawler.on('event', debug);

    // allow external listeners to hook into events
    crawler.on('event', (str) => eventer.emit('event', str));

    // log into the DHIS2 application
    // configure the crawler with the global username and password
    await crawler.login(username, password);

    const { dashboards } = schedule;

    debug('downloading the following dashboards: %j', dashboards);

    // TODO - is the multiple dashboards, or just one dashboard?
    const components = await crawler.downloadDashboardComponents(dashboards, { skipGraphs: true });

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

    debug('rendering report.');

    const attachments = [];
    // eslint-disable-next-line
    for (const dashboard of components) {
      // eslint-disable-next-line
      const attachment = await scribe.render(dashboard.title, dashboard);
      attachments.push(attachment);
    }

    debug('Finished rendering');

    eventer.emit('event', `Composing an email with ${attachments.length} attachments.`);
    const email = mail.compose(schedule, attachments);

    debug('Composed email and sending...');
    const userEmailAddresses = users.data.users.map((user) => user.email);
    eventer.emit('event', `Sending email to ${userEmailAddresses.length} users.`);
    await mail.send(userEmailAddresses, schedule.subject, email, attachments);

    eventer.emit('event', 'Done!  Schedule completed successfully.');
    debug('Email sent');
  } catch (err) {
    eventer.emit('event', `Whoops!  We hit the following error: ${err.toString()}`);
    await crawler.panic();
  }
}

exports.runScheduledTask = runScheduledTask;
exports.events = eventer;
