/**
 * @overview executor
 *
 * @description
 * The executor script defines and executes the schedules to be completed
 * on the schedule.
 */
const DHIS2Crawler = require('@ima-worldhealth/dhis2-crawler');
const api = require('@ima-worldhealth/dhis2-api');
const debug = require('debug')('executor');
const db = require('./db');
// const scribe = require('./scribe');
const mail = require('./mail');

const serverAddress = new URL(process.env.SERVER).origin;
const crawler = new DHIS2Crawler(serverAddress);

// run
async function runScheduledTask(schedule) {
  debug('running schedule with id: %s', schedule.id);

  // configure the crawler with the user who made the schedule
  const auth = db.getCollection('authentication');
  const { credentials } = auth.findOne({ id: schedule.user_id });

  debug('startup up web crawler');

  // spin up a chrome instance.
  await crawler.startup();

  debug('logging in to DHIS2 application');

  // log into the DHIS2 application
  await crawler.login(credentials.username, credentials.password);

  debug('credentials accepted.');
  const dashboards = schedule.dashboards.map(board => board.displayName);

  debug('downloading the following dashboards: %j', dashboards);
  // TODO - is the multiple dashboards, or just one dashboard?
  const files = await crawler.downloadDashboardComponents(dashboards);

  debug('download completed.');
  // terminate the chrome browser
  await crawler.shutdown();

  debug('querying the DHIS2 API to see if what users to send to.');

  // figure out which users we want to send to.
  const group = await api.userGroups.get(schedule.userGroupId);
  console.log('group:', group);
  const userIds = group.data.users.map(user => user.id);
  const users = await api.users.list({ fields: 'id,name,email', filter: `id:in:[${userIds.join(',')}]` });

  debug('rendering report.');

  console.log('files:', files);
  console.log('files:', JSON.stringify(files));

  // eslint-disable-next-line
  if (false) {
  // template a new PDF report with the rendered dashboard
    const report = await scribe.render(schedule, files);

    // email the values to a particular user group.
    await scribe.email(schedule, users, report);
  }

  debug('Finished rendering');

  const email = mail.compose(schedule, []);

  debug('Composed email and sending...');
  const userEmailAddresses = users.data.users.map(user => user.email);
  await mail.send(userEmailAddresses, schedule.subject, email, []);

  debug('Email sent');
}

exports.runScheduledTask = runScheduledTask;
