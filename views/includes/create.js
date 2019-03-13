const frequencySelect = document.querySelector('#frequency > select');
const dayOfMonthSelect = document.querySelector('#day-of-month > select');
const dayOfWeekSelect = document.querySelector('#day-of-week > select');
const hourOfDaySelect = document.querySelector('#hour-of-day > select');

const dayOfMonthElement = document.querySelector('#day-of-month');
const dayOfWeekElement = document.querySelector('#day-of-week');
const hourOfDayElement = document.querySelector('#hour-of-day');


function addClassIfNotExists(element, klassName) {
  if (!element.className.includes(klassName)) {
    // eslint-disable-next-line
    element.className += ' '.concat(klassName);
  }
}

function removeClassIfExists(element, klassName) {
  const klasses = element.className;
  if (klasses.includes(klassName)) {
    // eslint-disable-next-line
    element.className = klasses
      .split(' ')
      .filter(klass => klass !== klassName)
      .join(' ');
  }
}

function clearAndHide(formGroupElement, selectElement) {
  // eslint-disable-next-line
  selectElement.value = undefined;
  addClassIfNotExists(formGroupElement, 'd-invisible');
  selectElement.setAttribute('disabled', true);
  selectElement.removeAttribute('required');
}

function showElement(formGroupElement, selectElement) {
  removeClassIfExists(formGroupElement, 'd-invisible');
  selectElement.removeAttribute('disabled');
  selectElement.setAttribute('required', true);
}

frequencySelect.addEventListener('change', () => {
  switch (frequencySelect.value) {
    case 'daily':
      clearAndHide(dayOfWeekElement, dayOfWeekSelect);
      clearAndHide(dayOfMonthElement, dayOfMonthSelect);
      showElement(hourOfDayElement, hourOfDaySelect);
      break;

    case 'weekly':
      clearAndHide(dayOfMonthElement, dayOfMonthSelect);
      showElement(dayOfWeekElement, dayOfWeekSelect);
      showElement(hourOfDayElement, hourOfDaySelect);
      break;

    case 'monthly':
      showElement(dayOfMonthElement, dayOfMonthSelect);
      clearAndHide(dayOfWeekElement, dayOfWeekSelect);
      showElement(hourOfDayElement, hourOfDaySelect);
      break;

    default:
      break;
  }
});

const form = document.querySelector('form[name="schedule"]');
const cron = document.querySelector('form input[name="cron"]');

function setCronValue(value) {
  cron.value = value;
}

/**
 * @description
 * Sets the hidden "cron" input with the correct cron value based on what the user
 * selects via the cascading selects.
 */
form.addEventListener('submit', () => {
  const hourValue = hourOfDaySelect.value;
  const weekValue = dayOfWeekSelect.value;
  const dayValue = dayOfMonthSelect.value;

  let crontab;
  switch (frequencySelect.value) {
    case 'daily':
      crontab = `0 ${hourValue} * * *`;
      break;
    case 'weekly':
      crontab = `0 ${hourValue} * * ${weekValue}`;
      break;
    case 'monthly':
      crontab = `0 ${hourValue} ${dayValue} * *`;
      break;
    default:
      break;
  }

  setCronValue(crontab);
});
