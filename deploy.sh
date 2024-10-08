#!/usr/bin/bash
# Usage:
#  1. Add variables to .env
#  2. Build OCI Images
#     1) To build overleaf image, run ./deploy.sh
#     2) To also build base image, run ./deploy.sh REV_NUMBER VERSIONS...
#        e.g. ./deploy.sh 2 latest 2023 2022 2021 2020


source .env

sed -i "s|REPLACE_ME_IAAA_KEY|$REPLACE_ME_IAAA_KEY|g" services/web/modules/launchpad/app/src/LaunchpadRouter.js
# replace REPLACE_ME_IAAA_ENDPOINT with real endpoint, mind the slashes
sed -i "s|REPLACE_ME_IAAA_ENDPOINT|$REPLACE_ME_IAAA_ENDPOINT|g" services/web/modules/launchpad/app/src/LaunchpadRouter.js

# download fonts from lcpu jfrog
curl -H "Authorization: Bearer $JFROG_TOKEN" "https://jfrog-internal.lcpu.dev/artifactory/latex/fonts.zip" --output fonts.zip
mkdir tmp_fonts
unzip fonts.zip -d tmp_fonts
mv tmp_fonts/fonts/* lcpu/fonts
rm -rf tmp_fonts fonts.zip

cd server-ce

for version in "${@:2}"
do
    VERSION=$version REV=$1 make build-base
done

make build-community