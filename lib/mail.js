/**
 * @overview mail
 *
 * @description
 * The mail library is responsible for composing and sending messages to
 * users once their report is ready.  It consists of two steps:
 *
 * compose - an email object is created by taking the email body, subject,
 * attachments, and other data to meld them into an email template.  Additionally,
 * variable substition is performed on the email body, such that fields can
 * be spliced in as needed.
 *
 * send - takes a composed email object and a list of addresses to BCC.  Returns
 * a promise.
 */

const {
  APP_EMAIL,
  APP_NAME,
  APP_URL,
  SENDGRID_API_KEY,
} = process.env;

const path = require('path');
const dayjs = require('dayjs');
const debug = require('debug')('sunfish:mail');

const mailer = require('@sendgrid/mail');

mailer.setApiKey(SENDGRID_API_KEY);

const formatAsList = (file, idx) => `${idx + 1}.  ${path.parse(file).name}`;
const r = (str) => new RegExp(str, 'g');

const minutes = (n) => n * (60 * 1000);

/**
 * @function template
 *
 * @description
 * A micro templating engine to process email bodies.
 */
function template(text, data) {
  return text
    .replace(r('{{subject}}'), data.subject)
    .replace(r('{{date}}'), dayjs(data.date).format('DD/MM/YYYY'))
    .replace(r('{{app.name}}'), data.app.name)
    .replace(r('{{app.email}}'), data.app.email)
    .replace(r('{{app.url}}'), data.app.url)
    .replace(r('{{dashboards}}'), data.dashboards.map(formatAsList).join('\n'));
}

function compose(schedule, attachments) {
  const { subject, body } = schedule;

  const data = {
    subject,
    data : new Date(),
    dashboards : attachments,
    app : {
      name : APP_NAME,
      url : APP_URL,
      email : APP_EMAIL,
    },
  };

  debug('templating the email into a sendable form.');

  // create an email based on the template submitted by the user.
  return template(body, data);
}

// prevents multiple emails from being sent.
// FIXME: Why do we have to do this?
const guard = new Map();

async function send(addresses, subject, body, attachments, guardKey) {
  if (guard.get(guardKey)) {
    debug(`Found a mail with guardkey ${guardKey}, skipping...`);
  } else {
    // remove the guard key after 15 minutes
    setTimeout(() => {
      debug(`Removing guardKey ${guardKey}`);
      guard.delete(guardKey);
    }, minutes(15));
  }

  const data = {
    subject,
    text : body,
    bcc : addresses,
    attachment : attachments,
    from : APP_EMAIL,
    to : APP_EMAIL,
    'h:Reply-To' : APP_EMAIL,
  };

  debug(`sending an email via sendgrid to ${data.to} with BCCs (${data.bcc.join(',')}).`);
  await mailer.send(data);
  debug('mail sent successfully');
}

exports.send = send;
exports.compose = compose;
