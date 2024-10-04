#!/usr/bin/bash

source .env

# replace REPLACE_ME_IAAA_KEY in services/web/modules/launchpad/app/src/LaunchpadRouter.js with $REPLACE_ME_IAAA_KEY
sed -i "s/REPLACE_ME_IAAA_KEY/$REPLACE_ME_IAAA_KEY/g" services/web/modules/launchpad/app/src/LaunchpadRouter.js

cd server-ce
make all