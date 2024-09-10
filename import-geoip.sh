#!/bin/bash
# 1. Download file to tmp folder from one of the following links
# https://www.maxmind.com/en/home
# https://github.com/Loyalsoldier/geoip?tab=readme-ov-file
# 2. Create new sqlite database and import from .csv
rm -rf tmp
mkdir -p tmp
cd tmp
database_filename=geolite2-contry.db
# Need MAXMIND_ACCOUNT_ID and MAXMIND_ACCOUNT_ID
if [ -z $MAXMIND_ACCOUNT_ID ] || [ -z $MAXMIND_LICENSE_KEY ]; then
    echo "Please set MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY"
    exit 1
fi
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
rm -f $database_filename
sqlite3 $database_filename ".mode csv" ".import $geolite2_country_dirname/GeoLite2-Country-Blocks-IPv4.csv blocks_ipv4"
sqlite3 $database_filename ".mode csv" ".import $geolite2_country_dirname/GeoLite2-Country-Locations-en.csv locations"
sed "s/merged_ipv4_data/$merged_table_name/g" ../merge.sql | sqlite3 $database_filename
sqlite3 $database_filename ".schema $merged_table_name" ".dump $merged_table_name --data-only" >dump.sql
# Login
# npx wrangler login
# Upload the dump file to cloudflare
database="geolite2_contry_${database_version}_${database_location}"
npx wrangler d1 create  $database --yes --location=$database_location
npx wrangler d1 execute $database --yes --remote --file=dump.sql
