require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const fs = require('fs');

const passport = require('passport');
const flash = require('express-flash');
const session = require('express-session');
const Redis = require('ioredis');
const RedisStore = require('connect-redis')(session);

const i18next = require('i18next');
const i18nextBackend = require('i18next-node-fs-backend');
const i18nextMiddleware = require('i18next-http-middleware');
const path = require('path');

const healthcheck = require('./lib/healthcheck');

const app = express();
const client = new Redis();

app.use(helmet());

app.set('view engine', 'pug');

app.use(express.json());
app.use(express.urlencoded({ extended : true }));

app.use(session({
  store : new RedisStore({ client }),
  resave : true,
  saveUninitialized : true,
  secret : 'b1e9d8a4-39a4-11e9-b7e2-03fe5e35051c',
}));

app.get('/logo.svg', (req, res) => {
  fs.createReadStream('./views/includes/logo.svg').pipe(res);
});

app.use(passport.initialize());
app.use(passport.session());

app.use(flash());

// preload english and french dictionaries
i18next
  .use(i18nextMiddleware.LanguageDetector)
  .use(i18nextBackend)
  .init({
    preload : ['en', 'fr'],
    backend : { loadPath : path.join(__dirname, '/locales/{{lng}}/{{lng}}.json') },
  });

// make it so that we don't have issues with language
app.use(i18nextMiddleware.handle(i18next, {
  removeLngFromUrl : true,
}));

app.use((req, res, next) => {
  res.locals.app = {
    url : process.env.APP_URL,
    name : process.env.APP_NAME,
    email : process.env.APP_EMAIL,
  };

  next();
});

app.use('/setup', require('./controllers/setup'));

// redirect to setup page if the application is not installed
app.use((req, res, next) => {
  if (!healthcheck.isInstalled()) {
    res.redirect('/setup');
  } else {
    next();
  }
});

app.use('/auth', require('./controllers/auth'));

// make sure the user is logged in
app.use((req, res, next) => {
  if (!req.user) { res.redirect('/auth/login'); } else {
    res.locals.user = req.user;
    next();
  }
});

app.use('/schedules', require('./controllers/schedules'));
app.use('/userGroups', require('./controllers/userGroups'));
app.use('/dashboards', require('./controllers/dashboards'));

app.use('/datasources', require('./controllers/datasources'));

app.get('/', (req, res) => {
  res.redirect('/schedules');
});

// listen to events
app.use('/events', require('./controllers/event-stream'));

app.listen(process.env.PORT, () => console.log(`Listening on ${process.env.PORT}`));

process.on('uncaughtException', (exception) => {
  console.error(exception);
  process.exit(1);
});

process.on('unhandledRejection', (rejection) => {
  console.error(rejection);
  process.exit(1);
});
