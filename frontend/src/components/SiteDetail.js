import React, { useEffect, useState, useRef } from 'react';
import { Table, Loader } from 'semantic-ui-react';
import axios from 'axios';
import './SiteDetail.css';

export default function SiteDetail({ site, onBack, backLabel = '← Back to Sites' }) {
  const [siteDetails, setSiteDetails] = useState(null);
  const [tables, setTables] = useState([]);
  const [satelliteTables, setSatelliteTables] = useState({});
  const [refTables, setRefTables] = useState({}); // Store reference table lookups
  const [refAttributesLookup, setRefAttributesLookup] = useState({}); // attribute_id -> { nm, type } from ref_attributes
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedTables, setExpandedTables] = useState([]);
  const mapRef = useRef();
  const mapViewRef = useRef();

  // Load all tables and filter for satellite tables
  useEffect(() => {
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
      }
    })();
    
    return () => { mounted = false; };
  }, [site]);

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

  // Load data for each satellite table and reference tables
  useEffect(() => {
    if (!tables.length) return;
    
    let mounted = true;
    (async () => {
      try {
        const data = {};
        const refs = {};
        const siteId = site.hub_site_id || site.id;
        
        for (const tableName of tables) {
          // Fetch all data first
          const res = await axios.get(`/api/table/${tableName}`);
          const allRows = res.data?.data || [];
          
          // Filter rows by hub_site_id
          const filteredRows = allRows.filter(row => row.hub_site_id === siteId);
          
          if (mounted) {
            data[tableName] = {
              columns: [],
              rows: filteredRows
            };
            
            // Get columns for this table
            if (allRows.length > 0) {
              data[tableName].columns = Object.keys(allRows[0]);
            } else {
              try {
                const colRes = await axios.get(`/api/columns/${tableName}`);
                data[tableName].columns = colRes.data?.columns?.map(c => c.column_name) || [];
              } catch (e) {
                data[tableName].columns = [];
              }
            }
            
            // ref_attributes is loaded in a separate effect (refAttributesLookup); no need to fetch here

            // Find and load reference tables for foreign keys
            for (const column of data[tableName].columns) {
              if (column.endsWith('_id') && column !== 'hub_site_id') {
                const refTableName = 'ref_' + column.substring(0, column.length - 3); // remove '_id' and add 'ref_'
                
                // Check if we haven't already loaded this reference table
                if (!refs[refTableName]) {
                  try {
                    const refRes = await axios.get(`/api/table/${refTableName}`, { params: { limit: 5000 } });
                    const refData = refRes.data?.data || [];
                    const prefix = column.substring(0, column.length - 3); // e.g. 'material', 'style', 'type', 'use'
                    const idCol = column;

                    // Resolve name column: ref tables use {prefix}_nm (e.g. material_nm, style_nm, type_nm, use_nm)
                    // or sometimes {prefix}_name / 'name' — pick first that exists in ref data
                    const candidateNameCols = [prefix + '_nm', prefix + '_name', 'name'];
                    const firstRow = refData[0];
                    const refKeys = firstRow ? Object.keys(firstRow) : [];
                    const nameCol = candidateNameCols.find(k => refKeys.includes(k)) || (prefix + '_nm');

                    const lookup = {};
                    refData.forEach(row => {
                      if (row[idCol] != null && row[nameCol] != null) {
                        lookup[row[idCol]] = row[nameCol];
                      }
                    });

                    if (mounted) {
                      refs[refTableName] = lookup;
                    }
                  } catch (e) {
                    if (mounted) {
                      refs[refTableName] = {};
                    }
                  }
                }
              }
            }
          }
        }
        
        if (mounted) {
          setSatelliteTables(data);
          setRefTables(refs);
          const withRecords = Object.keys(data).filter(t => (data[t]?.rows?.length ?? 0) > 0);
          setExpandedTables(withRecords);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load satellite table data', err);
        if (mounted) {
          setError('Failed to load some satellite tables');
          setLoading(false);
        }
      }
    })();
    
    return () => { mounted = false; };
  }, [tables, site]);

  // Initialize ArcGIS map and load geometry
  useEffect(() => {
    if (!site) return;

    let retries = 0;
    let viewInstance = null;

    const initializeMap = (Map, MapView, Extent, Graphic, Polygon, Polyline, Point) => {
      if (!mapRef.current) return;
      try {
        if (mapViewRef.current) {
          try { mapViewRef.current.destroy(); } catch (e) {}
        }
        const map = new Map({ basemap: 'arcgis-streets' });
        const view = new MapView({
          container: mapRef.current,
          map,
          extent: new Extent({ xmin: -74.256, ymin: 40.496, xmax: -73.700, ymax: 40.916, spatialReference: { wkid: 4326 } })
        });
        mapViewRef.current = view;
        viewInstance = view;

        view.when(() => {
          (async () => {
              try {
                const siteId = site.hub_site_id || site.id;
                const response = await axios.get(`/api/sites/${siteId}/geometry`);
                const siteGeoms = response.data?.data || [];
                view.graphics.removeAll();
                let bounds = null;

                const getCentroid = (geomData) => {
                  try {
                    if (geomData.type === 'Point') {
                      return { x: geomData.coordinates[0], y: geomData.coordinates[1] };
                    } else if (geomData.type === 'LineString') {
                      const mid = Math.floor(geomData.coordinates.length / 2);
                      return { x: geomData.coordinates[mid][0], y: geomData.coordinates[mid][1] };
                    } else if (geomData.type === 'Polygon') {
                      const ring = geomData.coordinates[0] || [];
                      let x = 0, y = 0;
                      ring.forEach(coord => { x += coord[0]; y += coord[1]; });
                      return { x: x / ring.length, y: y / ring.length };
                    } else if (geomData.type === 'MultiPolygon') {
                      let x = 0, y = 0, count = 0;
                      geomData.coordinates.forEach(poly => {
                        const ring = poly[0] || [];
                        ring.forEach(coord => { x += coord[0]; y += coord[1]; count++; });
                      });
                      return count > 0 ? { x: x / count, y: y / count } : null;
                    }
                    return null;
                  } catch (e) { return null; }
                };

                const addGraphic = (geometry, symbol) => {
                  if (geometry && symbol) {
                    view.graphics.add(new Graphic({ geometry, symbol }));
                    if (geometry.extent) bounds = bounds ? bounds.union(geometry.extent) : geometry.extent;
                  }
                };
                const fillSymbol = { type: 'simple-fill', color: [226, 119, 40, 0.6], outline: { color: [226, 119, 40], width: 3 } };
                const lineSymbol = { type: 'simple-line', color: [226, 119, 40], width: 4 };
                const pointSymbol = { type: 'simple-marker', color: [226, 119, 40], size: 16, outline: { color: [255, 255, 255], width: 3 } };
                const pinSymbol = { type: 'simple-marker', style: 'circle', color: [0, 113, 188], size: 18, outline: { color: [255, 255, 255], width: 3 } };

                siteGeoms.forEach((row) => {
                  try {
                    let geomData = row.geometry ?? row.shape ?? row.geom ?? row.the_geom;
                    if (typeof geomData === 'string') geomData = JSON.parse(geomData);
                    if (!geomData || !geomData.type) return;
                    const spatialRef = (geomData.crs?.properties?.name === 'EPSG:2263') ? { wkid: 2263 } : { wkid: 4326 };

                    if (geomData.type === 'MultiPolygon') {
                      geomData.coordinates.forEach((poly) => {
                        const ring = poly[0];
                        if (ring && ring.length) {
                          const geometry = new Polygon({ rings: [ring], spatialReference: spatialRef });
                          addGraphic(geometry, fillSymbol);
                        }
                      });
                    } else if (geomData.type === 'Polygon') {
                      const geometry = new Polygon({ rings: geomData.coordinates, spatialReference: spatialRef });
                      addGraphic(geometry, fillSymbol);
                    } else if (geomData.type === 'LineString') {
                      const geometry = new Polyline({ paths: [geomData.coordinates], spatialReference: spatialRef });
                      addGraphic(geometry, lineSymbol);
                    } else if (geomData.type === 'Point') {
                      const geometry = new Point({ x: geomData.coordinates[0], y: geomData.coordinates[1], spatialReference: spatialRef });
                      addGraphic(geometry, pointSymbol);
                    }

                    const centroid = getCentroid(geomData);
                    if (centroid) {
                      const pinGeometry = new Point({ x: centroid.x, y: centroid.y, spatialReference: spatialRef });
                      view.graphics.add(new Graphic({ geometry: pinGeometry, symbol: pinSymbol }));
                      if (pinGeometry.extent) bounds = bounds ? bounds.union(pinGeometry.extent) : pinGeometry.extent;
                    }
                  } catch (e) { /* skip invalid geometry */ }
                });
                if (bounds && siteGeoms.length > 0) view.goTo({ target: bounds, padding: { top: 50, left: 50, right: 50, bottom: 50 } });
              } catch (err) { console.error('Geometry load error:', err); }
            })();
          }).catch((error) => {
            console.error('Error initializing map view:', error);
          });
      } catch (error) {
        console.error('Error creating map:', error);
      }
    };

    const tryInitialize = () => {
      retries++;
      if (!mapRef.current || !window.require) {
        if (retries < 30) setTimeout(tryInitialize, 100);
        return;
      }
      window.require(['esri/Map', 'esri/views/MapView', 'esri/geometry/Extent', 'esri/Graphic', 'esri/geometry/Polygon', 'esri/geometry/Polyline', 'esri/geometry/Point'], initializeMap, (err) => console.error('ArcGIS modules:', err));
    };
    tryInitialize();
    
    return () => {
      if (viewInstance) {
        try {
          viewInstance.destroy();
          viewInstance = null;
          mapViewRef.current = null;
        } catch (error) {
          console.error('Error destroying map view:', error);
        }
      }
    };
  }, [site]);

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
            {attrs.map(([key, value]) => (
              <div key={key} className="site-detail-attr">
                <span className="site-detail-attr-key">{attrDisplayName(key)}</span>
                <span className="site-detail-attr-val">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="site-detail-map-wrap">
          <span className="site-detail-map-label">Location</span>
          <div ref={mapRef} className="site-detail-map" />
        </div>
      </section>

      {tablesWithRecords.length > 0 && (
        <section className="site-detail-satellite">
          <div className="site-detail-satellite-header">Satellite Data · {tablesWithRecords.length} table{tablesWithRecords.length !== 1 ? 's' : ''}</div>
          <div className="site-detail-satellite-body">
            {loading && <Loader active inline="centered" />}
            {!loading && tablesWithRecords.map(tableName => (
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
                                    const refTableName = 'ref_' + col.substring(0, col.length - 3);
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
          </div>
        </section>
      )}

      {tables.length === 0 && !loading && (
        <div className="site-detail-empty">No satellite tables found for this site.</div>
      )}
    </div>
  );
}
