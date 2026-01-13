import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

export default function SiteDetail({ site, onBack }) {
  const [siteDetails, setSiteDetails] = useState(null);
  const [tables, setTables] = useState([]);
  const [satelliteTables, setSatelliteTables] = useState({});
  const [refTables, setRefTables] = useState({}); // Store reference table lookups
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedTable, setExpandedTable] = useState(null);
  const mapRef = useRef();
  const mapViewRef = useRef();

  // Load all tables and filter for satellite tables
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await axios.get('/api/tables');
        const allTables = res.data?.tables || [];
        
        // Filter for satellite tables related to this site (sat_site_*)
        const satellites = allTables.filter(t => t.startsWith('sat_site_'));
        
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
            
            // Special handling for sat_site_attributes
            if (tableName === 'sat_site_attributes') {
              try {
                const refRes = await axios.get('/api/table/ref_attributes');
                const refData = refRes.data?.data || [];
                
                // Create a lookup: attribute_id -> {attribute_nm, attribute_type}
                const attrLookup = {};
                refData.forEach(row => {
                  if (row.attribute_id) {
                    attrLookup[row.attribute_id] = {
                      nm: row.attribute_nm,
                      type: row.attribute_type
                    };
                  }
                });
                
                if (mounted) {
                  refs['ref_attributes_full'] = attrLookup;
                }
              } catch (e) {
                if (mounted) {
                  refs['ref_attributes_full'] = {};
                }
              }
            }
            
            // Find and load reference tables for foreign keys
            for (const column of data[tableName].columns) {
              if (column.endsWith('_id') && column !== 'hub_site_id') {
                const refTableName = 'ref_' + column.substring(0, column.length - 3); // remove '_id' and add 'ref_'
                
                // Check if we haven't already loaded this reference table
                if (!refs[refTableName]) {
                  try {
                    const refRes = await axios.get(`/api/table/${refTableName}`);
                    const refData = refRes.data?.data || [];
                    
                    // Create a lookup map: id -> name
                    const lookup = {};
                    refData.forEach(row => {
                      const idCol = column; // e.g., 'material_id'
                      const nameCol = column.substring(0, column.length - 3) + '_nm'; // e.g., 'material_nm'
                      if (row[idCol] && row[nameCol]) {
                        lookup[row[idCol]] = row[nameCol];
                      }
                    });
                    
                    if (mounted) {
                      refs[refTableName] = lookup;
                    }
                  } catch (e) {
                    // Reference table doesn't exist, skip
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

    // Retry until mapRef is available and SDK is loaded
    let retries = 0;
    const initMap = () => {
      retries++;
      if (!mapRef.current || !window.require) {
        if (retries < 30) setTimeout(initMap, 100);
        return;
      }

      window.require(['esri/Map', 'esri/views/MapView', 'esri/geometry/Extent', 'esri/Graphic', 'esri/geometry/Polygon', 'esri/geometry/Polyline', 'esri/geometry/Point'], 
        (Map, MapView, Extent, Graphic, Polygon, Polyline, Point) => {
          const view = new MapView({
            container: mapRef.current,
            map: new Map({ basemap: 'arcgis-streets' }),
            extent: new Extent({ xmin: -74.256, ymin: 40.496, xmax: -73.700, ymax: 40.916, spatialReference: { wkid: 4326 } })
          });
          mapViewRef.current = view;

          view.when(() => {
            (async () => {
              try {
                const siteId = site.hub_site_id || site.id;
                console.log('Loading geometries for siteId:', siteId);
                const response = await axios.get('/api/table/sat_site_geometry');
                console.log('sat_site_geometry response:', response.data);
                const siteGeoms = response.data?.data?.filter(g => g.hub_site_id === siteId) || [];
                console.log('Filtered geometries for site:', siteGeoms);
                
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

                siteGeoms.forEach((geom, idx) => {
                  try {
                    let geomData = geom.shape;
                    console.log(`Processing geometry ${idx}:`, geomData);
                    
                    // Parse if it's a string (JSON from backend)
                    if (typeof geomData === 'string') {
                      geomData = JSON.parse(geomData);
                    }
                    
                    if (!geomData || !geomData.type) {
                      console.warn(`Geometry ${idx} missing or invalid type`);
                      return;
                    }
                    
                    let geometry = null, symbol = null;
                    const spatialRef = geomData.crs?.properties?.name === 'EPSG:2263' ? { wkid: 2263 } : { wkid: 4326 };
                    
                    if (geomData.type === 'MultiPolygon') {
                      const rings = geomData.coordinates.map(poly => poly[0]); // Get outer ring of each polygon
                      geometry = new Polygon({ rings, spatialReference: spatialRef });
                      symbol = { type: 'simple-fill', color: [226, 119, 40, 0.6], outline: { color: [226, 119, 40], width: 3 } };
                    } else if (geomData.type === 'Polygon') {
                      geometry = new Polygon({ rings: geomData.coordinates, spatialReference: spatialRef });
                      symbol = { type: 'simple-fill', color: [226, 119, 40, 0.6], outline: { color: [226, 119, 40], width: 3 } };
                    } else if (geomData.type === 'LineString') {
                      geometry = new Polyline({ paths: [geomData.coordinates], spatialReference: spatialRef });
                      symbol = { type: 'simple-line', color: [226, 119, 40], width: 4 };
                    } else if (geomData.type === 'Point') {
                      geometry = new Point({ x: geomData.coordinates[0], y: geomData.coordinates[1], spatialReference: spatialRef });
                      symbol = { type: 'simple-marker', color: [226, 119, 40], size: 16, outline: { color: [255, 255, 255], width: 3 } };
                    }
                    
                    if (geometry && symbol) {
                      view.graphics.add(new Graphic({ geometry, symbol }));
                      console.log(`Added feature ${idx} to map`);
                      if (geometry.extent) bounds = bounds ? bounds.union(geometry.extent) : geometry.extent;
                    }
                    
                    // Add pin marker at centroid
                    const centroid = getCentroid(geomData);
                    if (centroid) {
                      const spatialRef = geomData.crs?.properties?.name === 'EPSG:2263' ? { wkid: 2263 } : { wkid: 4326 };
                      const pinGeometry = new Point({ x: centroid.x, y: centroid.y, spatialReference: spatialRef });
                      const pinSymbol = { 
                        type: 'simple-marker', 
                        style: 'circle', 
                        color: [0, 113, 188], 
                        size: 18, 
                        outline: { color: [255, 255, 255], width: 3 } 
                      };
                      view.graphics.add(new Graphic({ geometry: pinGeometry, symbol: pinSymbol }));
                      console.log(`Added pin ${idx} at:`, centroid);
                    }
                  } catch (e) { console.warn('Geometry parse error:', e); }
                });
                
                console.log('Total geometries loaded:', siteGeoms.length, 'Bounds:', bounds);
                if (bounds && siteGeoms.length > 0) {
                  view.goTo({ target: bounds, padding: { top: 50, left: 50, right: 50, bottom: 50 } });
                  console.log('Zoomed to bounds');
                }
              } catch (err) { console.error('Geometry load error:', err); }
            })();
          });
        }
      );
    };

    initMap();
    return () => { if (mapViewRef.current) mapViewRef.current.destroy(); };
  }, [site]);

  if (!siteDetails) {
    return <div className="text-center py-8 text-slate-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <Button variant="outline" onClick={onBack} className="mb-4">
            ← Back to Sites
          </Button>
          
          <h2 className="text-2xl font-bold mb-4">Site Details</h2>
          {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}
          
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>{siteDetails.name || 'Site'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(siteDetails).map(([key, value]) => {
                      if (key === 'id' || key === 'hub_site_id' || !value) return null;
                      return (
                        <div key={key}>
                          <strong className="text-sm">{key.replace(/_/g, ' ')}:</strong>{' '}
                          <span className="text-sm">{String(value)}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <div className="col-span-2">
              <div ref={mapRef} style={{ height: 600, width: '100%', borderRadius: '4px', boxSizing: 'border-box' }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {tables.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Satellite Data ({tables.length} tables)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && <div className="text-center text-slate-500">Loading...</div>}
            
            {tables.map(tableName => (
              <div key={tableName} className="mb-6">
                <div 
                  className="cursor-pointer flex items-center mb-3"
                  onClick={() => setExpandedTable(expandedTable === tableName ? null : tableName)}
                >
                  <span className="mr-2">{expandedTable === tableName ? '▼' : '▶'}</span>
                  <h4 className="text-lg font-semibold">{tableName.replace(/_/g, ' ').toUpperCase()}</h4>
                  <span className="ml-2 text-sm text-slate-500">
                    ({satelliteTables[tableName]?.rows?.length || 0} records)
                  </span>
                </div>
                
                {expandedTable === tableName && satelliteTables[tableName] && (
                  <div className="overflow-x-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {tableName === 'sat_site_attributes' ? (
                            <>
                              <TableHead>Attribute Name</TableHead>
                              <TableHead>Attribute Value</TableHead>
                            </>
                          ) : (
                            satelliteTables[tableName].columns.map(col => (
                              <TableHead key={col}>{col.replace(/_/g, ' ')}</TableHead>
                            ))
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {satelliteTables[tableName].rows.length > 0 ? (
                          satelliteTables[tableName].rows.map((row, idx) => {
                            if (tableName === 'sat_site_attributes') {
                              const attrLookup = refTables['ref_attributes_full'] || {};
                              const attrInfo = attrLookup[row.attribute_id];
                              if (!attrInfo) return null;
                              const valueColName = `attribute_value_${attrInfo.type}`;
                              const attrValue = row[valueColName];
                              return (
                                <TableRow key={idx}>
                                  <TableCell>{attrInfo.nm}</TableCell>
                                  <TableCell>{attrValue}</TableCell>
                                </TableRow>
                              );
                            }
                            return (
                              <TableRow key={idx}>
                                {satelliteTables[tableName].columns.map(col => {
                                  let displayValue = row[col];
                                  if (col.endsWith('_id') && col !== 'hub_site_id' && row[col]) {
                                    const refTableName = 'ref_' + col.substring(0, col.length - 3);
                                    const lookup = refTables[refTableName] || {};
                                    displayValue = lookup[row[col]] || row[col];
                                  }
                                  return <TableCell key={`${idx}-${col}`}>{displayValue}</TableCell>;
                                })}
                              </TableRow>
                            );
                          })
                        ) : (
                          <TableRow>
                            <TableCell 
                              colSpan={tableName === 'sat_site_attributes' ? 2 : satelliteTables[tableName].columns.length} 
                              className="text-center text-slate-500"
                            >
                              No data
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      
      {tables.length === 0 && !loading && (
        <Alert>
          <AlertDescription>No satellite tables found for this site</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
