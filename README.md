# Country-Aware DNS over HTTPS for Optimized CDN Routing

This Cloudflare Worker script provides a DNS over HTTPS (DoH) service with intelligent ECS (EDNS Client Subnet) handling for improved CDN performance.

[中文介绍](https://crzidea.com/#/article/introducing-crzidea-doh)

![](https://www.plantuml.com/plantuml/png/bP7HRjCm58RlznI7NWs9sXfi876rAKLT9T95BTc4fgboujFMmh63VRokF3sEILKQxMQNFZxVdo-_hpq9Hw7HP--KgNMG25kYrd_bt8aTsoZQXYfuTBKrX8PORHlUQc4wPkn9QbNnx79STACo_yuRuGbT7AsoZdWXrdRff4WZrEwFaYYujDkpvJukDkVJcmymcYgw3HNSrAIiyQCu6Rq_BEHvFERY9LT6djva3_6OQHlaMWk7y63TBtG3F9kSBaqk-liYhbfpNiPJwT5rquczXKmhD7Jafnq_jNQZ8pjVzl02TJ9FSXSCYg0rJD7E2f22H2KymjhP1WxYHoG9VMHGjjeAEOJ8mgdi4Ko_-ud112Ev_x_BdXhqqADbJruoME3lW9uEBzoXp8TAsaOemtR_C2RncTUfXR5g-UDiMQncnTDXLDjWoEtvOtPNpdyiVgwokyct9ouqeJE2r3CcwhwO9qeQFuuVTVlUfbD9bLwzecCyswIcZnZi56qXEa1iAReQf67IvxSaHQzNazAhV65mBxIIWX0S-g09x1fS7twL4WOF5YEkqSZGwBy0)

## How it works:

1. **ECS Extraction:** The worker extracts two sets of ECS options from URL:

   - **Client IP:** The actual IP address of the client making the request.
   - **Alternative IP:** Typically, the external IP address of a VPN connection.

2. **Dual DNS Resolution:** The worker performs two DNS resolutions for each request, one using the client IP and one using the alternative IP.

3. **Intelligent Response Selection:** The worker compares the IP addresses returned in both DNS responses:
   - **Same Country Match:** If the IP address returned using the client IP is located in the same country as the client, that response is chosen. This prioritizes local CDN nodes for optimal performance.
   - **Alternative IP Response:** If the client IP response doesn't match the client's country, the response obtained using the alternative IP is chosen. This ensures content delivery even when using a VPN or experiencing routing issues.

## Benefits:

- **Improved CDN Performance:** By intelligently selecting the best DNS response based on client location, the worker ensures requests are routed to the most optimal CDN nodes.
- **Enhanced Privacy:** Utilizing DoH encrypts DNS queries, preventing eavesdropping and manipulation.
- **Seamless VPN Integration:** The worker's dual resolution approach ensures uninterrupted content delivery even when using a VPN.

## Deployment:

This worker is designed for deployment on the Cloudflare Workers platform. Here are the steps to deploy:

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Login to Wrangler:**

   ```bash
   npx wrangler login
   ```

3. **Download, create, and import the GeoIP database:**

   You need to set following env vars before run the import script:
	```bash
 	export MAXMIND_ACCOUNT_ID=
	export MAXMIND_LICENSE_KEY=
	export CLOUDFLARE_ACCOUNT_ID=
	export CLOUDFLARE_API_TOKEN=
 	```
   Then, run the script:
 	```bash
 	./import-geoip.sh
 	```
   The script will do the following tasks
	- Download the GeoLite2 Country database from MaxMind and extract it to the `./tmp` directory.
   - Create a D1 database on Cloudflare and import the downloaded database into the D1 database.


4. **Configure wrangler.toml:**

	```sh
 	mv tmp/wrangler.toml .
 	```

6. **Deploy:**
   ```bash
   npm run deploy
   ```

## DoH URL Example:

Replace `doh.subdomain.workers.dev` with your domain name after deploying the script to cloudflare workers.

```
https://doh.subdomain.workers.dev/client-ip/223.5.5.5/client-country/CN/alternative-ip/8.8.8.8/dns-query
```

## Contributing:

Contributions are welcome! Please feel free to open issues or submit pull requests.
