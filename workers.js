export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const clientIp = url.pathname.substring(1).split('/')[0]; // Extract IP from path
    const clientIpNumber = ipToNumber(clientIp);
    const start = Date.now()
    const { country_iso_code: clientIpCountry } = await env.geolite2_country.prepare(
      'select country_iso_code from merged_ipv4_data where network_start <= ?1 and network_end >= ?1 limit 1')
      .bind(clientIpNumber)
      .first();
    console.log(Date.now() - start)
    console.log(clientIpCountry, clientIpNumber)

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

    // Extract DNS Header and Question Section
    const [headerAndQuestion, questionEnd] = extractHeaderAndQuestion(queryData);

    // Construct a new OPT record with ECS option
    const optRecord = createOptRecord(clientIp);

    // Combine the header, question, and new OPT record to create a new query
    const newQueryData = combineQueryData(headerAndQuestion, optRecord);

    // Forward the modified query to Google DNS
    const response = await fetch('https://dns.google/dns-query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/dns-message'
      },
      body: newQueryData
    });

    return new Response(response.body, response);
  }
};

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
  return newQueryData;
}

// Convert IP to Number
function ipToNumber(ip) {
  return ip.split('.').reduce((int, octet) => {
    return (int << 8) + parseInt(octet, 10);
  }, 0) >>> 0; // Ensures the result is an unsigned 32-bit integer
}
