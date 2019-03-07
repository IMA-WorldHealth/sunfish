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
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN_NAME,
  APP_EMAIL,
  APP_NAME,
  APP_URL,
} = process.env;

const dayjs = require('dayjs');
const debug = require('debug')('mail');

const mailgun = require('mailgun-js')({
  apiKey: MAILGUN_API_KEY,
  domain: MAILGUN_DOMAIN_NAME,
});

const formatAsList = (file, idx) => `${idx + 1}.  ${file}`;
const r = str => new RegExp(str, 'g');

/**
 * @function template
 *
 * @description
 * A micro templating engine to process email bodies.
 */
function template(text, data) {
  return text
    .replace(r('{{ subject }}'), data.subject)
    .replace(r('{{ date }}'), dayjs(data.date).format('DD/MM/YYYY'))
    .replace(r('{{ app.name }}'), data.app.name)
    .replace(r('{{ app.email }}'), data.app.email)
    .replace(r('{{ app.url }}'), data.app.url)
    .replace(r('{{ dashboards }}'), data.dashboards.map(formatAsList).join('\n'));
}

function compose(schedule, attachments) {
  const { subject, body } = schedule;

  const data = {
    subject,
    data: new Date(),
    dashboards: attachments,
    app: {
      name: APP_NAME,
      url: APP_URL,
      email: APP_EMAIL,
    },
  };

  // create an email based on the template submitted by the user.
  return template(body, data);
}

function send(addresses, subject, body, attachments) {
  const data = {
    subject,
    text: body,
    bcc: addresses,
    attachment: attachments,
    from: APP_EMAIL,
    to: APP_EMAIL,
    'h:Reply-To': APP_EMAIL,
  };

  return mailgun.messages().send(data);
}

exports.send = send;
exports.compose = compose;
