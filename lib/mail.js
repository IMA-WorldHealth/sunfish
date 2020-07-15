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
  DEVELOPERS_EMAIL,
  APP_EMAIL,
  APP_NAME,
  APP_URL,
  SENDGRID_API_KEY,
} = process.env;

const path = require('path');
const fs = require('fs');
const dayjs = require('dayjs');
const debug = require('debug')('sunfish:mail');

const mailer = require('@sendgrid/mail');

mailer.setApiKey(SENDGRID_API_KEY);

const formatAsList = (file, idx) => `${idx + 1}.  ${path.parse(file).name}`;
const r = (str) => new RegExp(str, 'g');

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

// prepares the file for Sendgrid.
async function prepareAttachment(filePath) {
  debug(`reading attachment: ${filePath}`);
  const file = await fs.promises.readFile(filePath);
  return {
    filename : path.parse(filePath).base,
    content : file.toString('base64'),
    type : 'application/pdf',
    disposition : 'attachment',
  };
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

async function send(addresses, subject, body, attachments) {
  // remove undefined BCC addresses.
  const bcc = addresses.filter((addr) => !!addr);

  const data = {
    subject,
    bcc,
    text : body,
    attachments : await Promise.all(attachments.map(prepareAttachment)),
    from : APP_EMAIL,
    to : DEVELOPERS_EMAIL,
  };

  debug(`sending an email via sendgrid to ${data.to} from ${data.from} with BCCs (${data.bcc.join(',')}).`);
  await mailer.send(data);
  debug('mail sent successfully');
}

exports.send = send;
exports.compose = compose;
