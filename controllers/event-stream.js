const router = require('express').Router();
const dayjs = require('dayjs');
const executor = require('../lib/executor');

router.get('/schedule', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.write('\n');

  // listen for active events and fire them off
  executor.events.on('event', (message) => {
    const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');

    const datapacket = {
      timestamp,
      message,
    };

    res.write(`id: ${Date.now()}\n`);
    res.write(`data: ${JSON.stringify(datapacket)}\n\n`);
    res.flushHeaders();
  });
});

module.exports = router;
