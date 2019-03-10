const source = new EventSource('/events/schedule');
const output = document.getElementById('event-output');

function format(datapacket) {
  const elem = document.createElement('p');

  const { timestamp, message } = datapacket;
  elem.innerHTML = `
    <span class="label label-primary">${timestamp}</span>
    <span>${message}</span>
  `;

  return elem;
}

function writer(message) {
  const formatted = format(message);
  output.appendChild(formatted);
}

function handler(event) {
  const message = JSON.parse(event.data);
  writer(message);
}

source.addEventListener('message', handler);
