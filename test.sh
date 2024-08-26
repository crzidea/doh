#!/bin/bash
exec curl --doh-insecure --doh-url "https://localhost:8787/223.70.235.2/dns-query" "https://www.aliyun.com" -I
