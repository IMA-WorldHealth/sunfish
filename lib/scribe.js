/**
 * @overview scribe
 *
 * @description
 * The scribe creates PDF reports from the data URIs downloaded from the
 * DHIS2 web app and predetermined HTML templates.  These are stitched
 * together using pugjs and then rendered using coral.
 */

const fs = require('fs');
const path = require('path');
const pug = require('pug');
const debug = require('debug')('sunfish:scribe');
const tempy = require('tempy');
const render = require('@ima-worldhealth/coral');

const TEMP_DIR = tempy.directory();

const TEMPLATE = fs.readFileSync(path.join(__dirname, './scribe-templates/default.pug'), 'utf8');
const compiler = pug.compile(TEMPLATE);

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

exports.render = async (label, report) => {
  const hrdate = humanReadableDateFormat(report.date || new Date());

  const filename = path.join(TEMP_DIR, `${label}-${hrdate}.pdf`);

  // check if file is already defined
  try {
    const file = await fs.promises.stats(filename);
    if (file.isFile()) {
      debug(`Found ${filename} on disk!  Skipping compilation`);
      return filename;
    }
  } catch (e) {
    debug(`Composing a new report: ${filename}`);
  }

  Object.assign(report, {
    date : humanReadableDateFormat(new Date()),
    title : label,
    graphs : makeImageGrid(report.graphs || []),
  });

  debug(`rendering report ${label}.`);

  const context = { path : path.join(__dirname) };
  const compiled = compiler({ report, context });

  debug(`compiled HTML.  Creating pdf for ${label}.`);

  // render the PDF using coral
  const pdf = await render(compiled);

  debug(`writing out to ${filename}.`);

  // write the file to disk
  await fs.promises.writeFile(filename, pdf);

  return filename;
};
