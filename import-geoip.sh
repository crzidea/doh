#!/bin/bash
set -e
set -o pipefail
# 1. Download file to tmp folder from one of the following links
# https://www.maxmind.com/en/home
# https://github.com/Loyalsoldier/geoip?tab=readme-ov-file
# 2. Create new sqlite database and import from .csv

: "${WORKERS_DEV:=true}"

rm -rf tmp
mkdir -p tmp
cd tmp
database_filename=geolite2-contry.db
# Need MAXMIND_ACCOUNT_ID MAXMIND_LICENSE_KEY CF_ACCOUNT_ID CF_API_TOKEN
if [ -z $MAXMIND_ACCOUNT_ID ] || [ -z $MAXMIND_LICENSE_KEY ]; then
    echo "Please set MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY"
    exit 1
fi
# Need CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN
if [ -z $CLOUDFLARE_ACCOUNT_ID ] || [ -z $CLOUDFLARE_API_TOKEN ]; then
    echo "Please set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN"
    exit 1
fi

# Download GeoLite2-Country-CSV from MaxMind
wget --content-disposition --user=$MAXMIND_ACCOUNT_ID --password=$MAXMIND_LICENSE_KEY 'https://download.maxmind.com/geoip/databases/GeoLite2-Country-CSV/download?suffix=zip'
unzip GeoLite2-Country-CSV_*.zip
rm GeoLite2-Country-CSV_*.zip
geolite2_country_dirname=`ls -d GeoLite2-Country-CSV_*`
database_version=`echo $geolite2_country_dirname | sed 's/GeoLite2-Country-CSV_//'`
# https://developers.cloudflare.com/d1/configuration/data-location/
# If there is no $database_location specified, default to weur
if [ -z $database_location ]; then
    database_location="weur"
fi
merged_table_name="merged_ipv4_data"
# Create database
sqlite3 $database_filename ".mode csv" ".import $geolite2_country_dirname/GeoLite2-Country-Blocks-IPv4.csv blocks_ipv4"
sqlite3 $database_filename ".mode csv" ".import $geolite2_country_dirname/GeoLite2-Country-Locations-en.csv locations"
sed "s/merged_ipv4_data/$merged_table_name/g" ../merge.sql | sqlite3 $database_filename
sqlite3 $database_filename ".schema $merged_table_name" ".dump $merged_table_name --data-only" >dump.sql
# Upload the dump file to cloudflare
database="geolite2_contry_${database_version}_${database_location}"
npx wrangler d1 create  $database --location=$database_location
npx wrangler d1 execute $database --yes --remote --file=dump.sql
database_id=`npx wrangler d1 info $database --json | jq --raw-output .uuid`

# Set read replication to auto
# https://developers.cloudflare.com/d1/best-practices/read-replication/#enable-read-replication-via-rest-api
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database/$database_id" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"read_replication": {"mode": "auto"}}'

sed -e "s/^database_name =.*/database_name = \"$database\"/" \
	-e "s/^database_id =.*/database_id = \"$database_id\"/" \
	-e "s/^workers_dev =.*/workers_dev = $WORKERS_DEV/" \
	../wrangler.template.toml >wrangler.toml
num_databases_retained=3
npx wrangler d1 list --json | jq ".[].name" --raw-output \
	| grep '^geolite2_contry_' | tail -n +$num_databases_retained \
	| sed 's/^/npx wrangler d1 delete /' | sh
