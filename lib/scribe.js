/**
 * @overview scribe
 *
 * @description
 * The scribe creates PDF reports from the data URIs downloaded from the
 * DHIS2 web app and predetermined HTML templates.  These are stitched
 * together using handlebards and then rendered using puppeteer.
 */

const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');
const debug = require('debug')('scribe');

const TEMPLATE = fs.readFileSync('./scribe-templates/default.hbs', 'utf8');
const compiler = handlebars.compile(TEMPLATE);

const PDF_OPTIONS = {
  pageSize: 'A4',
  viewportSize: '1920x1080',
  orientation: 'portrait',
  footerRight: '[page] / [topage]',
  footerLeft: 'IMA World Health',
};


/**
 * @function makeImageGrid
 *
 * @description
 * This function just zips up image URIs into an array of arrays.  Each image is
 * a pair.
 */
function makeImageGrid(images) {
  const grid = [];
  images.forEach((image, index, array) => {
    if (index % 2 === 0) {
      grid[Math.floor(index / 2)] = [image, array[index + 1]];
    }
  });

  return grid;
}

function pad(value) {
  const str = `${value}`;
  return str.length < 2 ? `0${str}` : str;
}

function humanReadableDateFormat(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
}

module.exports = (label, report) => {
  report.date = humanReadableDateFormat(new Date());
  report.title = label;
  report.graphs = makeImageGrid(report.graphs || []);

  debug(`rendering report ${label}.`);

  const context = { path: path.join(__dirname) };
  const compiled = compiler({ report, context });
  const filename = `reports/output/${label}-${report.date}.pdf`;

  const stream = wkhtmltopdf(compiled, PDF_OPTIONS)
    .pipe(fs.createWriteStream(filename));

  return streamToPromise(stream).then(() => filename);
};
