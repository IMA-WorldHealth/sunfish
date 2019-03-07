const api = require('@ima-worldhealth/dhis2-api');
const router = require('express').Router();
const db = require('../lib/db');

function refreshUserGroupList() {
  const groups = db.getCollection('userGroups');
  return api.userGroups.list()
    .then(({ data }) => {
      groups.clear();
      groups.insert(data.userGroups);
      return data.userGroups;
    });
}

router.get('/', (req, res) => {
  const { data } = db.getCollection('userGroups');
  res.render('data-list', { data, header: 'User Groups' });
});

module.exports = router;
module.exports.refreshUserGroupList = refreshUserGroupList;
