# DNS over HTTPS for Optimized CDN Performance

This Cloudflare Worker script provides a DNS over HTTPS (DoH) service with intelligent ECS (EDNS Client Subnet) handling for improved CDN performance.

## How it works:

1. **ECS Extraction:** The worker extracts two sets of ECS options from incoming DNS requests:

   - **Client IP:** The actual IP address of the client making the request.
   - **Client Country:** The country associated with the client's IP address.
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

   - Download the GeoLite2 Country database from MaxMind and extract it to the `./tmp` directory.
   - Create a D1 database on Cloudflare and import the downloaded database into the D1 database using the following command:
     ```bash
     ./import-geoip.sh
     ```

4. **Configure wrangler.toml:**

   - Create a `wrangler.toml` file in the root directory of your project.
   - Add the following section, replacing placeholders with your D1 database information:
     ```toml
     [[d1_databases]]
     binding = "geolite2_country"
     database_name = "your-database-name"
     database_id = "your-database-id"
     ```

5. **Deploy:**
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
