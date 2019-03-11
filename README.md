Sunfish
-------

Sunfish is an application to turn DHIS2 dashboards into PDFs and mail them to members of user groups
on a set schedule.  It uses DHIS2 for authentication, meaning that if you have an account with DHIS2,
you will automatically have an account on Sunfish and can log in to view the schedules.

This application is used internally at IMA World Health to deliver monthly dashboards to users of
DHIS2 by email.

How It Works
------------

Sunfish relies on two other projects of IMA World Health:
 1. [dhis2-api](https://github.com/IMA-WorldHealth/dhis2-api)
 2. [dhis2-crawler](https://github.com/IMA-WorldHealth/dhis2-crawler)

These two projects enable Sunfish to download data from DHIS2 as well as crawl the website
dashboards and turn them into PDFs to email to users.


[LICENSE](./LICENSE)
