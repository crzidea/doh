#!/bin/bash
curl --doh-insecure --doh-url "https://localhost:8787/client-ip/223.5.5.5/client-country/CN/alternative-ip/8.8.8.8/dns-query" "https://www.aliyun.com" -I -4 -v
