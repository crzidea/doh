CREATE TABLE IF NOT EXISTS merged_ipv4_data (
    network_start INTEGER,
    network_end INTEGER,
    country_iso_code TEXT,
    network TEXT
);
-- CREATE INDEX IF NOT EXISTS idx_network_range ON merged_ipv4_data (network_start, network_end);
CREATE INDEX IF NOT EXISTS idx_network_start ON merged_ipv4_data (network_start);

INSERT INTO merged_ipv4_data (network_start, network_end, country_iso_code, network)
SELECT
    -- Calculate network_start
    (
        (
            (CAST(SUBSTR(network, 1, INSTR(network, '.') - 1) AS INTEGER) * 256 * 256 * 256) +
            (CAST(SUBSTR(SUBSTR(network, INSTR(network, '.') + 1), 1, INSTR(SUBSTR(network, INSTR(network, '.') + 1), '.') - 1) AS INTEGER) * 256 * 256) +
            (CAST(SUBSTR(SUBSTR(SUBSTR(network, INSTR(network, '.') + 1), INSTR(SUBSTR(network, INSTR(network, '.') + 1), '.') + 1), 1, INSTR(SUBSTR(SUBSTR(network, INSTR(network, '.') + 1), INSTR(SUBSTR(network, INSTR(network, '.') + 1), '.') + 1), '.') - 1) AS INTEGER) * 256) +
            CAST(SUBSTR(SUBSTR(SUBSTR(SUBSTR(network, INSTR(network, '.') + 1), INSTR(SUBSTR(network, INSTR(network, '.') + 1), '.') + 1), INSTR(SUBSTR(SUBSTR(network, INSTR(network, '.') + 1), INSTR(SUBSTR(network, INSTR(network, '.') + 1), '.') + 1), '.') + 1), 1, INSTR(SUBSTR(SUBSTR(SUBSTR(network, INSTR(network, '.') + 1), INSTR(SUBSTR(network, INSTR(network, '.') + 1), '.') + 1), INSTR(SUBSTR(SUBSTR(network, INSTR(network, '.') + 1), INSTR(SUBSTR(network, INSTR(network, '.') + 1), '.') + 1), '.') + 1), '/') - 1) AS INTEGER)
        ) & (4294967295 << (32 - CAST(SUBSTR(network, INSTR(network, '/') + 1) AS INTEGER)))
    ) AS network_start,

    -- Calculate network_end
    (
        (
            (CAST(SUBSTR(network, 1, INSTR(network, '.') - 1) AS INTEGER) * 256 * 256 * 256) +
            (CAST(SUBSTR(SUBSTR(network, INSTR(network, '.') + 1), 1, INSTR(SUBSTR(network, INSTR(network, '.') + 1), '.') - 1) AS INTEGER) * 256 * 256) +
            (CAST(SUBSTR(SUBSTR(SUBSTR(network, INSTR(network, '.') + 1), INSTR(SUBSTR(network, INSTR(network, '.') + 1), '.') + 1), 1, INSTR(SUBSTR(SUBSTR(network, INSTR(network, '.') + 1), INSTR(SUBSTR(network, INSTR(network, '.') + 1), '.') + 1), '.') - 1) AS INTEGER) * 256) +
            CAST(SUBSTR(SUBSTR(SUBSTR(SUBSTR(network, INSTR(network, '.') + 1), INSTR(SUBSTR(network, INSTR(network, '.') + 1), '.') + 1), INSTR(SUBSTR(SUBSTR(network, INSTR(network, '.') + 1), INSTR(SUBSTR(network, INSTR(network, '.') + 1), '.') + 1), '.') + 1), 1, INSTR(SUBSTR(SUBSTR(SUBSTR(network, INSTR(network, '.') + 1), INSTR(SUBSTR(network, INSTR(network, '.') + 1), '.') + 1), INSTR(SUBSTR(SUBSTR(network, INSTR(network, '.') + 1), INSTR(SUBSTR(network, INSTR(network, '.') + 1), '.') + 1), '.') + 1), '/') - 1) AS INTEGER)
        ) | (4294967295 >> CAST(SUBSTR(network, INSTR(network, '/') + 1) AS INTEGER))
    ) AS network_end,

    locations.country_iso_code,
    blocks_ipv4.network
FROM
    blocks_ipv4
JOIN
    locations
ON
    blocks_ipv4.registered_country_geoname_id = locations.geoname_id;
