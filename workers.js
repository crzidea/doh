let geolite2_country = null;
let CLOUDFLARE_API_TOKEN = null;
let upstream_endpoint = 'https://dns.google/dns-query';
// const dohUrl = 'https://unfiltered.adguard-dns.com/dns-query';

export default {
  async fetch(request, env, ctx) {
    geolite2_country ??= env.geolite2_country;
    CLOUDFLARE_API_TOKEN ??= env.CLOUDFLARE_API_TOKEN;
    upstream_endpoint = env.upstream_endpoint || upstream_endpoint;
    const url = new URL(request.url);
    // Example: /client-ip/223.5.5.5/client-country/CN/alternative-ip/8.8.8.8/dns-query
    // Extracted:
    //  clientIp: 223.5.5.5
    //  clientCountry: CN
    //  alternativeIp: 8.8.8.8
    const params = url.pathname.substring(1).split('/');
    const clientIp = env.connectingIp ||
      extractParam(params, 'client-ip') ||
      request.headers.get('cf-connecting-ip')
    const clientCountry = env.connectingIpCountry ||
      extractParam(params, 'client-country') ||
      request.headers.get('cf-ipcountry')
    const alternativeIp = extractParam(params, 'alternative-ip') || params[0];

    let queryData;

    if (request.method === 'GET') {
      const dnsParam = url.searchParams.get('dns');
      if (!dnsParam) {
        return new Response('Missing dns parameter', { status: 400 });
      }
      // Decode the base64-encoded DNS query
      const decodedQuery = atob(dnsParam);
      queryData = new Uint8Array(decodedQuery.length);
      for (let i = 0; i < decodedQuery.length; i++) {
        queryData[i] = decodedQuery.charCodeAt(i);
      }
    } else if (request.method === 'POST') {
      const originalQuery = await request.arrayBuffer();
      queryData = new Uint8Array(originalQuery);
    } else {
      return new Response('Unsupported method', { status: 405 });
    }

    async function queryDnsWithClientIp() {
      const response = await queryDns(queryData, clientIp)
      const buffer = await response.arrayBuffer()
      const dnsResponse = parseDnsResponse(buffer)
      if (!dnsResponse.answers.length || !isIPv4(dnsResponse.answers[0] || !clientIp)) {
        return new Response(buffer, response);
      }
      const queryCountryInfoStart = Date.now();
      const responseIpSample = dnsResponse.answers[0];
      const responseIpCountry = await ip2country(responseIpSample)
      const queryCountryInfoEnd = Date.now();
      console.log(`Response Sample: ${responseIpSample}, ${responseIpCountry}`)
      console.log(`Query Country Info Time: ${queryCountryInfoEnd - queryCountryInfoStart}ms`)
      if (clientCountry === responseIpCountry) {
        return new Response(buffer, response);
      }
      return null
    }

    const queryUpstreamStart = Date.now();
    const [response, alternativeResponse] = await Promise.all([
      queryDnsWithClientIp(),
      queryDns(queryData, alternativeIp)
    ]);
    const queryUpstreamEnd = Date.now();

    console.log(`Query Upstream Time: ${queryUpstreamEnd - queryUpstreamStart}ms`)

    if (response) {
      return response;
    } else {
      return new Response(alternativeResponse.body, alternativeResponse);
    }
  }
};

function extractParam(params, name) {
  const index = params.indexOf(name);
  if (~index) {
    return params[index + 1];
  }
  return null;
}

async function queryDns(queryData, clientIp) {
  let newQueryData = queryData;
  if (clientIp) {
    // Extract DNS Header and Question Section
    const [headerAndQuestion, questionEnd] = extractHeaderAndQuestion(queryData);

    // Construct a new OPT record with ECS option
    const optRecord = createOptRecord(clientIp);

    // Combine the header, question, and new OPT record to create a new query
    newQueryData = combineQueryData(headerAndQuestion, optRecord);
  }

  // Convert UInt8Array into Base64 string
  // const encodedQuery = btoa(String.fromCharCode(...newQueryData));

  // Construct the URL with the encoded query
  // const url = new URL(dohUrl);
  // url.searchParams.set('dns', encodedQuery);
  // const response = await fetch(url, {
  //   headers: {
  //     'Content-Type': 'application/dns-message'
  //   },
  //   cf: {
  //     // https://developers.cloudflare.com/workers/examples/cache-using-fetch/
  //     cacheTtl: 1,
  //     cacheEverything: true,
  //   }
  // });

  const start = Date.now();
  // Forward the modified query
  const response = await fetch(upstream_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/dns-message'
    },
    body: newQueryData
  });
  console.log(`Simple DNS Query Time: ${Date.now() - start}ms`)

  return response
}

function extractHeaderAndQuestion(data) {
  let offset = 12; // DNS header is 12 bytes

  // Get the number of questions
  const qdcount = (data[4] << 8) | data[5];

  // Skip the Question Section
  for (let i = 0; i < qdcount; i++) {
    while (data[offset] !== 0) offset++; // Skip QNAME
    offset += 5; // Skip QNAME (0 byte) + QTYPE (2 bytes) + QCLASS (2 bytes)
  }

  // Extract Header and Question Section
  const headerAndQuestion = data.subarray(0, offset);

  return [headerAndQuestion, offset];
}

function createOptRecord(clientIp) {
  let ecsData;
  let family;

  if (isIPv4(clientIp)) {
    // Convert client IP to bytes
    const ipParts = clientIp.split('.').map(part => parseInt(part, 10));
    family = 1; // IPv4
    const prefixLength = 32; // Adjust the prefix length as needed
    ecsData = [0, 8, 0, 8, 0, family, prefixLength, 0, ...ipParts];
  } else if (isIPv6(clientIp)) {
    // Convert client IP to bytes
    const ipParts = ipv6ToBytes(clientIp);
    family = 2; // IPv6
    const prefixLength = 128; // Adjust the prefix length as needed
    ecsData = [0, 8, 0, 20, 0, family, prefixLength, 0, ...ipParts];
  } else {
    throw new Error('Invalid IP address');
  }

  // Construct the OPT record
  return new Uint8Array([
    0, // Name (root)
    0, 41, // Type: OPT
    16, 0, // UDP payload size (default 4096)
    0, 0, 0, 0, // Extended RCODE and flags
    0, ecsData.length, // RD Length
    ...ecsData
  ]);
}

function isIPv4(ip) {
  return ip.split('.').length === 4;
}

function isIPv6(ip) {
  return ip.split(':').length > 2; // At least 3 groups separated by colons
}

function ipv6ToBytes(ipv6) {
  // Split the IPv6 address into segments
  let segments = ipv6.split(':');

  // Expand shorthand notation (e.g., '::')
  let expandedSegments = [];
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === '') {
      // Insert zero segments for "::"
      let zeroSegments = 8 - (segments.length - 1);
      expandedSegments.push(...new Array(zeroSegments).fill('0000'));
    } else {
      expandedSegments.push(segments[i]);
    }
  }

  // Convert each segment into a 16-bit number and then into 8-bit numbers
  let bytes = [];
  for (let segment of expandedSegments) {
    let segmentValue = parseInt(segment, 16);
    bytes.push((segmentValue >> 8) & 0xff); // High byte
    bytes.push(segmentValue & 0xff);        // Low byte
  }

  return bytes;
}

function combineQueryData(headerAndQuestion, optRecord) {
  // Combine the header and question section with the new OPT record
  const newQueryData = new Uint8Array(headerAndQuestion.length + optRecord.length);
  newQueryData.set(headerAndQuestion, 0);
  newQueryData.set(optRecord, headerAndQuestion.length);
  // https://en.wikipedia.org/wiki/Domain_Name_System#DNS_message_format
  // Incrementing the QDCOUNT field (offset 3) to 32, signaling an additional record in the question section.
  // Setting the ARCOUNT field (offset 11) to 1, indicating one additional record in the message.
  newQueryData.set([32], 3);
  newQueryData.set([1], 11);
  return newQueryData;
}

// Convert IP to Number
function ip2number(ip) {
  return ip.split('.').reduce((int, octet) => {
    return (int << 8) + parseInt(octet, 10);
  }, 0) >>> 0; // Ensures the result is an unsigned 32-bit integer
}

async function ip2country(ip) {
  return ip2countryWithD1(ip)
  // return ip2countryWithIplocationNet(ip)
  // return ip2countryWithCloudflareRadar(ip)
}

async function ip2countryWithD1(ip) {
  const ipNumber = ip2number(ip);
  const { country_iso_code } = await geolite2_country.prepare(
    'select country_iso_code from merged_ipv4_data where network_start <= ?1 order by network_start desc limit 1;')
    .bind(ipNumber)
    .first();
  return country_iso_code;
}

// Unstable
async function ip2countryWithIplocationNet(ip) {
  const response = await fetch(`https://api.iplocation.net/?cmd=ip-country&ip=${ip}`)
  const json = await response.json()
  return json.country_code2
}

// Too slow
async function ip2countryWithCloudflareRadar(ip) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/radar/entities/ip?ip=${ip}`,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`
      }
    }
  )
  const json = await response.json()
  return json.result.ip.location
}

function parseDnsResponse(buffer) {
  const dnsResponse = new Uint8Array(buffer);
  let offset = 0;

  // Parse the header (first 12 bytes)
  const id = (dnsResponse[offset++] << 8) | dnsResponse[offset++];
  const flags = (dnsResponse[offset++] << 8) | dnsResponse[offset++];
  const qdCount = (dnsResponse[offset++] << 8) | dnsResponse[offset++];
  const anCount = (dnsResponse[offset++] << 8) | dnsResponse[offset++];
  const nsCount = (dnsResponse[offset++] << 8) | dnsResponse[offset++];
  const arCount = (dnsResponse[offset++] << 8) | dnsResponse[offset++];

  // Skip the question section (name + type + class)
  for (let i = 0; i < qdCount; i++) {
    while (dnsResponse[offset] !== 0)
      offset++;
    // Skip domain name
    offset += 5;
    // Skip null byte, type, and class
  }

  // Parse the answer section
  const answers = [];
  for (let i = 0; i < anCount; i++) {
    const name = dnsResponse[offset++] << 8 | dnsResponse[offset++];
    const type = dnsResponse[offset++] << 8 | dnsResponse[offset++];
    const dnsClass = dnsResponse[offset++] << 8 | dnsResponse[offset++];
    const ttl = (dnsResponse[offset++] << 24) | (dnsResponse[offset++] << 16) | (dnsResponse[offset++] << 8) | dnsResponse[offset++];
    const dataLen = dnsResponse[offset++] << 8 | dnsResponse[offset++];

    if (type === 1) {
      // A record (IPv4 address)
      const ip = [];
      for (let j = 0; j < dataLen; j++) {
        ip.push(dnsResponse[offset++]);
      }
      answers.push(ip.join('.'));
    } else {
      // Skip other types
      offset += dataLen;
    }
  }

  return {
    id,
    flags,
    qdCount,
    anCount,
    nsCount,
    arCount,
    answers
  };
}
