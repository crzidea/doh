#!/bin/bash
# 1. Download file to tmp folder from one of the following links
# https://www.maxmind.com/en/home
# https://github.com/Loyalsoldier/geoip?tab=readme-ov-file
# 2. Create new sqlite database and import from .csv
mkdir -p tmp
cd tmp
database_filename=geolite2-contry.db
geolite2_country_dirname=`ls -d GeoLite2-Country-CSV_*`
database_version=`echo $geolite2_country_dirname | sed 's/GeoLite2-Country-CSV_//'`
# https://developers.cloudflare.com/d1/configuration/data-location/
database_location="weur"
merged_table_name="merged_ipv4_data"
rm -f $database_filename
sqlite3 $database_filename ".mode csv" ".import $geolite2_country_dirname/GeoLite2-Country-Blocks-IPv4.csv blocks_ipv4"
sqlite3 $database_filename ".mode csv" ".import $geolite2_country_dirname/GeoLite2-Country-Locations-en.csv locations"
sed "s/merged_ipv4_data/$merged_table_name/g" ../merge.sql | sqlite3 $database_filename
sqlite3 $database_filename ".schema $merged_table_name" ".dump $merged_table_name --data-only" >dump.sql
# Login
# npx wrangler login
# Upload the dump file to cloudflare
database="geolite2_contry_${database_version}_${database_location}"
npx wrangler d1 create $database --location=$database_location
npx wrangler d1 execute $database --remote --file=dump.sql
