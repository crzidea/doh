import sqlite3

def merge_non_target_countries(source_db, target_db, target_countries):
    # Connect to source database
    src_conn = sqlite3.connect(source_db)
    src_cur = src_conn.cursor()

    # Fetch all rows sorted by network_start
    src_cur.execute("SELECT * FROM merged_ipv4_data ORDER BY network_start")
    rows = src_cur.fetchall()

    # Close source connection
    src_conn.close()

    # Prepare new dataset
    filtered_rows = []
    merged_network_start = None
    merged_network_end = None
    merged_networks = []
    merging = False

    for row in rows:
        network_start, network_end, country_iso_code, network = row

        if country_iso_code in target_countries:
            # If merging, finalize the previous merge
            if merging:
                filtered_rows.append((merged_network_start, merged_network_end, 'OTHER', ','.join(merged_networks)))
                merging = False
            # Keep target country row as is
            filtered_rows.append(row)
        else:
            if not merging:
                merged_network_start = network_start
                merged_networks = []
                merging = True
            merged_network_end = network_end
            merged_networks.append(network)

    # Finalize last merge if any
    if merging:
        filtered_rows.append((merged_network_start, merged_network_end, 'OTHER', ','.join(merged_networks)))

    # Create new database
    tgt_conn = sqlite3.connect(target_db)
    tgt_cur = tgt_conn.cursor()

    # Create table
    tgt_cur.execute("""
        CREATE TABLE merged_ipv4_data (
            network_start INTEGER,
            network_end INTEGER,
            country_iso_code TEXT,
            network TEXT
        )
    """)

    # Insert filtered rows
    tgt_cur.executemany("INSERT INTO merged_ipv4_data VALUES (?, ?, ?, ?)", filtered_rows)
    tgt_conn.commit()
    tgt_conn.close()
    print(f"Filtered database created: {target_db}")

# Example usage
merge_non_target_countries("./tmp/geolite2-contry.db", "./tmp/filtered.db", ["CN", "HK", "JP"])

# Check results
# sqlite3 -readonly tmp/geolite2-contry.db "SELECT country_iso_code, count(*) FROM merged_ipv4_data GROUP BY country_iso_code ORDER BY count(*);"
# sqlite3 -readonly tmp/filtered.db "SELECT country_iso_code, count(*) FROM merged_ipv4_data GROUP BY country_iso_code ORDER BY count(*);"
