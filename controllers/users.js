const api = require('@ima-worldhealth/dhis2-api');
const router = require('express').Router();
const db = require('../lib/db');

function refreshUserList() {
  const users = db.getCollection('users');
  return api.users.list({ fields: 'id,displayName,email' })
    .then(({ data }) => {
      users.clear();
      users.insert(data.users);
      return data.users;
    });
}

router.get('/', (req, res) => {
  const { data } = db.getCollection('users');
  res.render('data-list', { data, header : 'Users' });
});

module.exports = router;
module.exports.refreshUserList = refreshUserList;
