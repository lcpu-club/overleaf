#!/usr/bin/bash

source .env

# replace REPLACE_ME_IAAA_KEY in services/web/modules/launchpad/app/src/LaunchpadRouter.js with $REPLACE_ME_IAAA_KEY
sed -i "s/REPLACE_ME_IAAA_KEY/$REPLACE_ME_IAAA_KEY/g" services/web/modules/launchpad/app/src/LaunchpadRouter.js

# download fonts from lcpu jfrog
curl -H "Authorization: Bearer $JFROG_TOKEN" "https://jfrog-internal.lcpu.dev/artifactory/latex/fonts.zip"
mkdir tmp_fonts
unzip fonts.zip -d tmp_fonts
mv tmp_fonts/fonts/* lcpu/fonts
rm -rf tmp_fonts fonts.zip

cd server-ce
make all