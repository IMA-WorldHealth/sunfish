require('dotenv').load();
const express = require('express');
const helmet = require('helmet');
const passport = require('passport');
const flash = require('express-flash');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);

const app = express();

app.use(helmet());

app.set('view engine', 'pug');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new RedisStore(), resave: true, saveUninitialized: true, secret: 'b1e9d8a4-39a4-11e9-b7e2-03fe5e35051c',
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(flash());


app.use((req, res, next) => {
  res.locals.app = {
    url: process.env.APP_URL,
    name: process.env.APP_NAME,
    email: process.env.APP_EMAIL,
  };
  next();
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
app.use('/users', require('./controllers/users'));
app.use('/userGroups', require('./controllers/userGroups'));
app.use('/dashboards', require('./controllers/dashboards'));

app.use('/datasources', require('./controllers/datasources'));

app.get('/', (req, res) => {
  res.redirect('/schedules');
});

// listen to events
app.use('/events', require('./controllers/event-stream'));

app.listen(process.env.PORT, () => console.log(`Listening on ${process.env.PORT}`));

process.on('uncaughtException', exception => console.error(exception));
