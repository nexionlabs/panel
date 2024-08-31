const express = require('express');
const session = require('express-session');
const passport = require('passport');
const bodyParser = require('body-parser');
const CatLoggr = require('cat-loggr');
const fs = require('node:fs');
const config = require('./config.json')
const ascii = fs.readFileSync('./handlers/ascii.txt', 'utf8');
const app = express();
const path = require('path');
const chalk = require('chalk');
const expressWs = require('express-ws')(app);
const { db } = require('./handlers/db.js')
const translationMiddleware = require('./handlers/translation');
const cookieParser = require('cookie-parser')
const rateLimit = require('express-rate-limit');


const sqlite = require("better-sqlite3");
const SqliteStore = require("better-sqlite3-session-store")(session);
const sessionstorage = new sqlite("sessions.db");

const { init } = require('./handlers/init.js');

const log = new CatLoggr();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(cookieParser())

app.use(translationMiddleware);

const postRateLimiter = rateLimit({
  windowMs: 60 * 100,
  max: 6,
  message: 'Too many requests, please try again later'
});

app.use((req, res, next) => {
  if (req.method === 'POST') {
    postRateLimiter(req, res, next);
  } else {
    next();
  }
});

app.set('view engine', 'ejs');
app.use(
  session({
    store: new SqliteStore({
      client: sessionstorage,
      expired: {
        clear: true,
        intervalMs: 9000000
      }
    }),
    secret: "secret",
    resave: true,
    saveUninitialized: true
  })
);

app.use((req, res, next) => {
  res.locals.languages = getlanguages();
  res.locals.ogTitle = config.ogTitle;
  res.locals.ogDescription = config.ogDescription;
  next();
});


if (config.mode === 'production' || false) {


  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '5');
    next();
  });


  app.use('/assets', (req, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=1');
    next();
  });

}

app.use(passport.initialize());
app.use(passport.session());

init();

console.log(chalk.gray(ascii) + chalk.white(`version v${config.version}\n`));

const routesDir = path.join(__dirname, 'routes');
function getlanguages() {
  return fs.readdirSync(__dirname + '/lang').map(file => file.split('.')[0])
}
function getlangname() {
  return fs.readdirSync(path.join(__dirname, '/lang')).map(file => {
    const langFilePath = path.join(__dirname, '/lang', file);
    const langFileContent = JSON.parse(fs.readFileSync(langFilePath, 'utf-8'));
    return langFileContent.langname;
  });
}


app.get('/setLanguage', async (req, res) => {
  const lang = req.query.lang;
  if (lang && (await getlanguages()).includes(lang)) {
    res.cookie('lang', lang, { maxAge: 90000000, httpOnly: true });
    req.user.lang = lang;
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

function loadRoutes(directory) {
  fs.readdirSync(directory).forEach(file => {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      loadRoutes(fullPath);
    } else if (stat.isFile() && path.extname(file) === '.js') {
      const route = require(fullPath);
      expressWs.applyTo(route);
      app.use("/", route);
    }
  });
}
loadRoutes(routesDir);

const pluginroutes = require('./plugins/pluginmanager.js');
app.use("/", pluginroutes);

const pluginDir = path.join(__dirname, 'plugins');
const PluginViewsDir = fs.readdirSync(pluginDir).map(addonName => path.join(pluginDir, addonName, 'views'));
app.set('views', [path.join(__dirname, 'views'), ...PluginViewsDir]);

app.use(express.static('public'));
app.listen(config.port, () => log.info(`nexion is listening on port ${config.port}`));

app.get('*', async function (req, res) {
  res.render('errors/404', { req, name: await db.get('name') || 'Skyport', logo: await db.get('logo') || false })
});