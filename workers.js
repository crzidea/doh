let geolite2_country = null;
const dohUrl = 'https://dns.google/dns-query';

export default {
  async fetch(request, env, ctx) {
    geolite2_country ??= env.geolite2_country;
    const url = new URL(request.url);
    const clientIp = url.pathname.substring(1).split('/')[0]; // Extract IP from path

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


    const queryUpstreamStart = Date.now();
    const response = await queryDns(queryData, clientIp);
    const queryUpstreamEnd = Date.now();

    const buffer = await response.arrayBuffer()
    const dnsResponse = parseDnsResponse(buffer)
    if (!dnsResponse.answers.length || !isIPv4(dnsResponse.answers[0])) {
      return new Response(buffer, response);
    }
    const queryCountryInfoStart = Date.now();
    const [requestInfo, responseInfo] = await Promise.all([
      await ip2country(clientIp),
      await ip2country(dnsResponse.answers[0])
    ])
    const queryCountryInfoEnd = Date.now();

    console.log(`Response CIDR: ${responseInfo.network}, ${responseInfo.country_iso_code}`)
    console.log(`Query Upstream Time: ${queryUpstreamEnd - queryUpstreamStart}ms`)
    console.log(`Query Country Info Time: ${queryCountryInfoEnd - queryCountryInfoStart}ms`)
    
    if (requestInfo.country_iso_code === responseInfo.country_iso_code) {
      return new Response(buffer, response);
    }

    let connectingIp = request.headers.get('CF-Connecting-IP')
    connectingIp = isIPv4(connectingIp) ? connectingIp : null;
    const backupResponse = await queryDns(queryData, connectingIp);
    return new Response(backupResponse.body, backupResponse);
  }
};

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

  // Forward the modified query to Google DNS
  const response = await fetch(dohUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/dns-message'
    },
    body: newQueryData
  });
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
  // Convert client IP to bytes
  const ipParts = clientIp.split('.').map(part => parseInt(part, 10));
  const ecsData = [0, 8, 0, 8, 0, 1, 32, 0, ...ipParts];

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
  const ipNumber = ip2number(ip);
  const result = await geolite2_country.prepare(
    'select country_iso_code, network from merged_ipv4_data where network_start <= ?1 order by network_start desc limit 1;')
    .bind(ipNumber)
    .first();
  return result;
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

function isIPv4(ip) {
  return ip.split('.').length === 4;
}
