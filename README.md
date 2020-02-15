Sunfish
-------

[![Greenkeeper badge](https://badges.greenkeeper.io/IMA-WorldHealth/sunfish.svg)](https://greenkeeper.io/)

Sunfish is an application to screenshot DHIS2 dashboards into PDFs and email them to members of user groups
on a set schedule.

This application is used internally at IMA World Health to deliver monthly dashboards to users of DHIS2 in
various programs.

How It Works
------------

Sunfish relies on three other projects of IMA World Health:
 1. [dhis2-api](https://github.com/IMA-WorldHealth/dhis2-api)
 2. [dhis2-crawler](https://github.com/IMA-WorldHealth/dhis2-crawler)
 3. [coral](https://github.com/IMA-WorldHealth/coral)


In brief, dhis2-api is a nodejs abstraction for the DHIS2 Web API, and provides authentication for
users and downloads lists of dashboards, user groups, and users.  dhis2-crawler is a [puppeteer](https://www.npmjs.com/package/puppeteer) 
wrapper for logging into and accessing DHIS2 dashbaords.  coral is a rendering engine also using
puppeteer to turn HTML templates into PDFs before emailing them.

Authentication is managed by DHIS2 - if a user has an account with DHIS2, they automatically have an account
with Sunfish.  Sunfish forwards on their username/password to DHIS2 for authentication.

A user sets up a schedule by specifying an email to deliver (subject and body), a user group to send it to, and
a frequency (daily, weekly, monthly).  The frequency is represented in standard unix cron syntax.  Schedules are
_not_ namespaced, so all users see all schedules and can manipulate them.

Schedules are stored in SQLite3 database for portability and use [cron-scheduler](https://npmjs.com/package/cron-scheduler)
to manage when they are run.

When a schedule is run, the following events take place:
 1. The schedule is loaded from the database.
 2. The dhis2-crawler spins up a headless browser and logs into DHIS2
 3. The dhi2-crawler navigates to each dashboard specified in the schedule using the dashboard id.  DHIS2 embeds these in the
 DOM, so it is able to navigate to these dashboards using CSS selectors.
 4. The dashboards are downloaded by converting each graph or table into a PNG Data URI.
 5. The DHIS2 API is queried to find out what users are in the user group specified.  Their email addresses are retrieved.
 6. Using coral, the dashboards are templated into an HTML template and converted into PDFs.  Each dashboard is 
 a separate PDF.
 7. The PDFs are added as attachments to the email message.
 8. MailGun sends the email to all addresses as a BCC list.
 9. Everything is shut down and cleaned up.



[LICENSE](./LICENSE)
