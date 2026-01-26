import React, { useEffect, useState } from 'react';
import { Table, Loader } from 'semantic-ui-react';
import axios from 'axios';
import './SiteDetail.css';
import SiteDetailMap from './SiteDetailMap';

export default function SiteDetail({ site, onBack, backLabel = '← Back to Sites', hideSatelliteData = false }) {
  const [siteDetails, setSiteDetails] = useState(null);
  const [tables, setTables] = useState([]);
  const [satelliteTables, setSatelliteTables] = useState({});
  const [refTables, setRefTables] = useState({}); // Store reference table lookups
  const [refAttributesLookup, setRefAttributesLookup] = useState({}); // attribute_id -> { nm, type } from ref_attributes
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedTables, setExpandedTables] = useState([]);
  const [bblData, setBblData] = useState(null); // BBL values for this site

  // Load all tables and filter for satellite tables (skip when hideSatelliteData – e.g. from project's selected sites)
  useEffect(() => {
    if (hideSatelliteData) {
      setSiteDetails(site);
      setTables([]);
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const res = await axios.get('/api/tables');
        const allTables = res.data?.tables || [];
        
        // Filter for satellite tables (sat_site_*), exclude sat_site_geometry (used only for the map)
        const satellites = allTables.filter(t => t.startsWith('sat_site_') && t !== 'sat_site_geometry');
        
        if (!mounted) return;
        setTables(satellites);
        setSiteDetails(site);
      } catch (err) {
        console.error('Failed to load tables', err);
        setError('Failed to load satellite tables');
        setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [site, hideSatelliteData]);

  // Load ref_attributes for resolving attr_<id> to attribute_nm (Details card) and for sat_site_attributes
  useEffect(() => {
    if (!site) return;
    let mounted = true;
    (async () => {
      try {
        const res = await axios.get('/api/table/ref_attributes');
        const rows = res.data?.data || [];
        const lookup = {};
        rows.forEach(r => {
          if (r.attribute_id != null) {
            lookup[r.attribute_id] = { nm: r.attribute_nm, type: r.attribute_type };
          }
        });
        if (mounted) setRefAttributesLookup(lookup);
      } catch (e) {
        if (mounted) setRefAttributesLookup({});
      }
    })();
    return () => { mounted = false; };
  }, [site]);

  // Load BBL data from sat_site_bbl for this site
  useEffect(() => {
    if (!site) return;
    const siteId = site.hub_site_id || site.id;
    if (!siteId) return;
    
    let mounted = true;
    (async () => {
      try {
        const res = await axios.get('/api/table/sat_site_bbl', { params: { limit: 100, hub_site_id: siteId } });
        const rows = res.data?.data || [];
        // Filter for this specific site and extract unique BBL values
        const siteBbls = rows
          .filter(r => String(r.hub_site_id) === String(siteId))
          .map(r => r.bbl)
          .filter(Boolean);
        const uniqueBbls = [...new Set(siteBbls)];
        if (mounted) setBblData(uniqueBbls.length > 0 ? uniqueBbls.join(' | ') : null);
      } catch (e) {
        if (mounted) setBblData(null);
      }
    })();
    return () => { mounted = false; };
  }, [site]);

  // Load data for each satellite table and reference tables
  useEffect(() => {
    if (!tables.length) {
      setLoading(false);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const data = {};
        const refs = {};
        const siteId = site.hub_site_id || site.id;

        // Fetch satellite tables in parallel, filtered by this site (hub_site_id)
        // Use allSettled so one missing/broken table does not fail the whole load
        const tablesSettled = await Promise.allSettled(
          tables.map(t => axios.get(`/api/table/${t}`, { params: { limit: 1000, hub_site_id: siteId } }))
        );

        const needColumnFetch = [];
        for (let i = 0; i < tables.length; i++) {
          const res = tablesSettled[i];
          const allRows = (res.status === 'fulfilled' ? res.value?.data?.data : null) || [];
          const filteredRows = allRows.filter(row => String(row.hub_site_id) === String(siteId));

          data[tables[i]] = { columns: [], rows: filteredRows };

          if (allRows.length > 0) {
            data[tables[i]].columns = Object.keys(allRows[0]);
          } else {
            needColumnFetch.push(tables[i]);
          }
        }

        const colRes = await Promise.all(
          needColumnFetch.map(t => axios.get(`/api/columns/${t}`).catch(() => ({ data: { columns: [] } })))
        );
        needColumnFetch.forEach((t, j) => {
          data[t].columns = colRes[j].data?.columns?.map(c => c.column_name) || [];
        });

        // Collect ref table names from *_id columns (except hub_site_id)
        // attribute_id -> ref_attributes (irregular name); others: material_id -> ref_material, etc.
        const refTableNames = [];
        for (const tableName of tables) {
          for (const col of data[tableName]?.columns || []) {
            if (col.endsWith('_id') && col !== 'hub_site_id') {
              const refName = col === 'attribute_id' ? 'ref_attributes' : 'ref_' + col.substring(0, col.length - 3);
              refTableNames.push(refName);
            }
          }
        }

        const refNames = [...new Set(refTableNames)];
        const refRes = await Promise.all(
          refNames.map(name =>
            axios.get(`/api/table/${name}`, { params: { limit: 5000 } }).catch(() => ({ data: { data: [] } }))
          )
        );

        refNames.forEach((refTableName, idx) => {
          const refData = refRes[idx]?.data?.data || [];
          const prefix = refTableName.replace(/^ref_/, '');
          // ref_attributes uses attribute_id/attribute_nm, not attributes_id
          const { idCol, candidates } = refTableName === 'ref_attributes'
            ? { idCol: 'attribute_id', candidates: ['attribute_nm', 'attribute_name', 'name'] }
            : { idCol: prefix + '_id', candidates: [prefix + '_nm', prefix + '_name', 'name'] };
          const firstRow = refData[0];
          const refKeys = firstRow ? Object.keys(firstRow) : [];
          const nameCol = candidates.find(k => refKeys.includes(k)) || candidates[0];
          const lookup = {};
          refData.forEach(row => {
            if (row[idCol] != null && row[nameCol] != null) {
              lookup[row[idCol]] = row[nameCol];
            }
          });
          refs[refTableName] = lookup;
        });

        if (mounted) {
          setSatelliteTables(data);
          setRefTables(refs);
          const withRecords = Object.keys(data).filter(t => (data[t]?.rows?.length ?? 0) > 0);
          setExpandedTables(withRecords);
        }
      } catch (err) {
        console.error('Failed to load satellite table data', err);
        if (mounted) {
          setError('Failed to load some satellite tables');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [tables, site]);

  if (!site) return null;
  // Use siteDetails when available (after /api/tables), else site so the map container exists from first render
  const displayDetails = siteDetails || site;
  const siteId = displayDetails.hub_site_id || displayDetails.id;
  const attrs = Object.entries(displayDetails).filter(([k, v]) => k !== 'id' && k !== 'hub_site_id' && v != null && v !== '');
  const tablesWithRecords = tables.filter(t => (satelliteTables[t]?.rows?.length ?? 0) > 0);

  const attrDisplayName = (key) => {
    const m = key.match(/^attr_(\d+)$/);
    if (m) {
      const id = parseInt(m[1], 10);
      const info = refAttributesLookup[id] || refAttributesLookup[m[1]];
      return info?.nm || key.replace(/_/g, ' ');
    }
    return key.replace(/_/g, ' ');
  };

  const toggleTable = (name) => {
    setExpandedTables(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]);
  };

  return (
    <div className="site-detail">
      <header className="site-detail-header">
        <button type="button" className="site-detail-back" onClick={onBack} aria-label="Go back">
          {backLabel}
        </button>
        <h1 className="site-detail-title">{displayDetails.name || 'Site'}</h1>
        {siteId != null && <span className="site-detail-id">ID: {siteId}</span>}
      </header>

      {error && <div className="site-detail-error">{error}</div>}

      <section className="site-detail-main">
        <div className="site-detail-card">
          <div className="site-detail-card-header">Details</div>
          <div className="site-detail-attrs">
            {bblData && (
              <div className="site-detail-attr site-detail-attr-highlight">
                <span className="site-detail-attr-key">BBL</span>
                <span className="site-detail-attr-val">{bblData}</span>
              </div>
            )}
            {attrs.map(([key, value]) => (
              <div key={key} className="site-detail-attr">
                <span className="site-detail-attr-key">{attrDisplayName(key)}</span>
                <span className="site-detail-attr-val">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
        <SiteDetailMap site={site} />
      </section>

      {tables.length > 0 && (
        <section className="site-detail-satellite">
          <div className="site-detail-satellite-header">
            {loading ? 'Satellite Data · loading…' : (tablesWithRecords.length > 0 ? `Satellite Data · ${tablesWithRecords.length} table${tablesWithRecords.length !== 1 ? 's' : ''}` : 'Satellite Data')}
          </div>
          <div className="site-detail-satellite-body">
            {loading && <Loader active inline="centered" />}
            {!loading && tablesWithRecords.length > 0 && tablesWithRecords.map(tableName => (
              <div key={tableName} className={`site-detail-table-block${expandedTables.includes(tableName) ? ' expanded' : ''}`}>
                <button
                  type="button"
                  className="site-detail-table-toggle"
                  onClick={() => toggleTable(tableName)}
                >
                  <span className="site-detail-table-toggle-icon">{expandedTables.includes(tableName) ? '▼' : '▶'}</span>
                  {tableName.replace(/_/g, ' ')}
                  <span className="site-detail-table-meta">{satelliteTables[tableName]?.rows?.length ?? 0} record{(satelliteTables[tableName]?.rows?.length ?? 0) !== 1 ? 's' : ''}</span>
                </button>
                {expandedTables.includes(tableName) && satelliteTables[tableName] && (() => {
                  const displayCols = satelliteTables[tableName].columns.filter(c => c !== 'hub_site_id' && c !== 'sort_order');
                  const sortedRows = [...satelliteTables[tableName].rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
                  return (
                  <div className="site-detail-table-inner">
                    <Table celled compact>
                      <Table.Header>
                        <Table.Row>
                          {tableName === 'sat_site_attributes' ? (
                            <>
                              <Table.HeaderCell>Attribute Name</Table.HeaderCell>
                              <Table.HeaderCell>Attribute Value</Table.HeaderCell>
                            </>
                          ) : (
                            displayCols.map(col => {
                              const label = col.endsWith('_id')
                                ? (col.substring(0, col.length - 3).charAt(0).toUpperCase() + col.substring(0, col.length - 3).slice(1))
                                : col.replace(/_/g, ' ');
                              return <Table.HeaderCell key={col}>{label}</Table.HeaderCell>;
                            })
                          )}
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {satelliteTables[tableName].rows.length > 0 ? (
                          sortedRows.map((row, idx) => {
                            if (tableName === 'sat_site_attributes') {
                              const attrInfo = refAttributesLookup[row.attribute_id];
                              if (!attrInfo) return null;
                              const valueColName = `attribute_value_${attrInfo.type}`;
                              const attrValue = row[valueColName];
                              return (
                                <Table.Row key={idx}>
                                  <Table.Cell>{attrInfo.nm}</Table.Cell>
                                  <Table.Cell>{attrValue}</Table.Cell>
                                </Table.Row>
                              );
                            }
                            return (
                              <Table.Row key={idx}>
                                {displayCols.map(col => {
                                  let displayValue = row[col];
                                  if (col.endsWith('_id') && row[col]) {
                                    const refTableName = col === 'attribute_id' ? 'ref_attributes' : 'ref_' + col.substring(0, col.length - 3);
                                    const lookup = refTables[refTableName] || {};
                                    displayValue = lookup[row[col]] || row[col];
                                  }
                                  return <Table.Cell key={`${idx}-${col}`}>{displayValue}</Table.Cell>;
                                })}
                              </Table.Row>
                            );
                          })
                        ) : (
                          <Table.Row>
                            <Table.Cell colSpan={tableName === 'sat_site_attributes' ? 2 : displayCols.length} textAlign="center">
                              No data
                            </Table.Cell>
                          </Table.Row>
                        )}
                      </Table.Body>
                    </Table>
                  </div>
                  );
                })()}
              </div>
            ))}
            {!loading && tablesWithRecords.length === 0 && (
              <div className="site-detail-empty">No records for this site in any satellite table.</div>
            )}
          </div>
        </section>
      )}

      {tables.length === 0 && !loading && (
        <div className="site-detail-empty">No satellite tables found for this site.</div>
      )}
    </div>
  );
}
