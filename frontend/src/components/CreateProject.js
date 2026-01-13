import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import axios from 'axios';
import './CreateProject.css';
import SiteSelectionModal from './SiteSelectionModal';

export default function CreateProject({ onCreated, onCancel, project }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    address: '',
    borough: '',
    latitude: null,
    longitude: null
  });
  const [schemaFields, setSchemaFields] = useState(null);
  const [schemaMeta, setSchemaMeta] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [errors, setErrors] = useState({});
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [selectedSites, setSelectedSites] = useState([]);

  const mapRef = useRef();
  const mapViewRef = useRef();

  // Initialize ArcGIS map
  useEffect(() => {
    if (!mapRef.current) return;

    // Use global esri object from CDN
    const esriModules = window.require;
    if (!esriModules) {
      console.error('ArcGIS SDK not loaded. Make sure the CDN script is loaded in index.html');
      return;
    }

    esriModules(['esri/Map', 'esri/views/MapView', 'esri/geometry/Extent'], (Map, MapView, Extent) => {
      const map = new Map({
        basemap: 'arcgis-streets'
      });

      // NYC extent (west, south, east, north)
      const nycExtent = new Extent({
        xmin: -74.256,
        ymin: 40.496,
        xmax: -73.700,
        ymax: 40.916,
        spatialReference: { wkid: 4326 }
      });

      const view = new MapView({
        container: mapRef.current,
        map: map,
        extent: nycExtent
      });

      mapViewRef.current = view;

      // Handle map click to set position
      view.on('click', (event) => {
        const point = view.toMap({ x: event.x, y: event.y });
        setPosition({ lat: point.latitude, lng: point.longitude });
      });

      return () => {
        view.destroy();
      };
    });
  }, []);

  // Fetch column metadata for hub_projects (authoritative). Fallback to sampling a row or defaults.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await axios.get('/api/columns/hub_projects');
        const cols = res.data?.columns || [];
        if (!mounted) return;
        if (cols.length > 0) {
          // exclude primary id column from editable fields
          const fields = cols.map(c => c.column_name).filter(cn => cn !== 'hub_project_id');
          setSchemaFields(fields);
          const meta = {};
          cols.forEach(c => { meta[c.column_name] = { data_type: c.data_type, enum_values: c.enum_values || null }; });
          setSchemaMeta(meta);
        } else {
          // fallback if columns endpoint returned nothing
          setSchemaFields(['name', 'description', 'address', 'borough', 'latitude', 'longitude']);
          setSchemaMeta({});
        }
      } catch (e) {
        // fallback to sampling a row if columns endpoint fails
        try {
          const res2 = await axios.get('/api/table/hub_projects', { params: { limit: 1 } });
          const sample = res2.data?.data?.[0] || null;
          if (!mounted) return;
          if (sample) {
            setSchemaFields(Object.keys(sample).filter(k => k !== 'id' && k !== 'hub_project_id'));
            setSchemaMeta({});
          } else {
            setSchemaFields(['name', 'description', 'address', 'borough', 'latitude', 'longitude']);
            setSchemaMeta({});
          }
        } catch (e2) {
          setSchemaFields(['name', 'description', 'address', 'borough', 'latitude', 'longitude']);
          setSchemaMeta({});
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  // If editing an existing project, pre-fill form fields
  useEffect(() => {
    if (project) {
      const p = project;
      const allowed = schemaFields || ['name', 'description', 'address', 'borough', 'latitude', 'longitude'];
      const newForm = { ...form };
      
      // Dynamically populate all fields from the project data that exist in schema
      for (const field of allowed) {
        if (field in p) {
          newForm[field] = p[field];
        }
      }
      
      // Also handle latitude/longitude with alternate names (lat/lng)
      if (!newForm.latitude && (p.lat || p.latitude)) {
        newForm.latitude = p.lat || p.latitude;
      }
      if (!newForm.longitude && (p.lng || p.longitude)) {
        newForm.longitude = p.lng || p.longitude;
      }
      
      setForm(newForm);
      
      // Display marker on map if coordinates exist
      if (newForm.latitude && newForm.longitude && mapViewRef.current && window.require) {
        window.require(['esri/Graphic'], (Graphic) => {
          const point = {
            type: 'point',
            longitude: newForm.longitude,
            latitude: newForm.latitude
          };
          
          mapViewRef.current.graphics.removeAll();
          const marker = new Graphic({
            geometry: point,
            symbol: {
              type: 'simple-marker',
              color: [226, 119, 40],
              size: 12
            }
          });
          mapViewRef.current.graphics.add(marker);
          mapViewRef.current.center = point;
        });
      }
    }
  }, [project, schemaFields]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load selected sites for the project
  useEffect(() => {
    if (!project?.id) return;
    (async () => {
      try {
        const response = await axios.get('/api/table/lnk_project_site');
        const projectSites = response.data?.data?.filter(ps => ps.hub_project_id === project.id) || [];
        setSelectedSites(projectSites.map(ps => ps.hub_site_id));
      } catch (err) {
        console.error('Failed to load project sites:', err);
      }
    })();
  }, [project?.id]);

  // Load and display site geometries on map when selected sites change
  useEffect(() => {
    if (!selectedSites.length || !mapViewRef.current || !window.require) return;

    (async () => {
      try {
        const response = await axios.get('/api/table/sat_site_geometry');
        const allGeoms = response.data?.data || [];
        const siteGeoms = allGeoms.filter(g => selectedSites.includes(g.hub_site_id));

        window.require(['esri/Graphic', 'esri/geometry/Polygon', 'esri/geometry/Polyline', 'esri/geometry/Point'], 
          (Graphic, Polygon, Polyline, Point) => {
            mapViewRef.current.graphics.removeAll();
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

            siteGeoms.forEach((geom) => {
              try {
                let geomData = geom.shape;
                if (typeof geomData === 'string') geomData = JSON.parse(geomData);
                if (!geomData || !geomData.type) return;

                let geometry = null, symbol = null;
                const spatialRef = geomData.crs?.properties?.name === 'EPSG:2263' ? { wkid: 2263 } : { wkid: 4326 };
                
                if (geomData.type === 'MultiPolygon') {
                  const rings = geomData.coordinates.map(poly => poly[0]);
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
                  mapViewRef.current.graphics.add(new Graphic({ geometry, symbol }));
                  if (geometry.extent) bounds = bounds ? bounds.union(geometry.extent) : geometry.extent;
                }

                // Add pin at centroid
                const centroid = getCentroid(geomData);
                if (centroid) {
                  const pinGeometry = new Point({ x: centroid.x, y: centroid.y, spatialReference: spatialRef });
                  const pinSymbol = { type: 'simple-marker', style: 'circle', color: [0, 113, 188], size: 18, outline: { color: [255, 255, 255], width: 3 } };
                  mapViewRef.current.graphics.add(new Graphic({ geometry: pinGeometry, symbol: pinSymbol }));
                }
              } catch (e) { console.warn('Geometry error:', e); }
            });

            if (bounds && siteGeoms.length > 0) {
              mapViewRef.current.goTo({ target: bounds, padding: { top: 50, left: 50, right: 50, bottom: 50 } });
            }
          }
        );
      } catch (err) {
        console.error('Failed to load site geometries:', err);
      }
    })();
  }, [selectedSites]);

  const setPosition = ({ lat, lng }) => {
    setForm(prev => ({ ...prev, latitude: lat, longitude: lng }));
    // clear any previous lat/lng errors
    setErrors(prev => ({ ...prev, latitude: undefined, longitude: undefined }));
    
    // Update marker on map
    if (mapViewRef.current && window.require) {
      window.require(['esri/Graphic'], (Graphic) => {
        const point = {
          type: 'point',
          longitude: lng,
          latitude: lat
        };

        mapViewRef.current.graphics.removeAll();
        const marker = new Graphic({
          geometry: point,
          symbol: {
            type: 'simple-marker',
            color: [226, 119, 40],
            size: 12
          }
        });
        mapViewRef.current.graphics.add(marker);
        mapViewRef.current.center = point;
      });
    }
  };

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const validate = () => {
    const err = {};
    const allowed = schemaFields || ['name', 'description', 'address', 'borough', 'latitude', 'longitude'];
    
    // Only validate fields that exist in the schema
    if (allowed.includes('name') && (!form.name || String(form.name).trim().length === 0)) {
      err.name = 'Name is required';
    }
    if (allowed.includes('address') && (!form.address || String(form.address).trim().length === 0)) {
      err.address = 'Address is required';
    }
    if (allowed.includes('latitude') && form.latitude != null) {
      if (isNaN(form.latitude) || form.latitude < -90 || form.latitude > 90) {
        err.latitude = 'Latitude must be a number between -90 and 90';
      }
    }
    if (allowed.includes('longitude') && form.longitude != null) {
      if (isNaN(form.longitude) || form.longitude < -180 || form.longitude > 180) {
        err.longitude = 'Longitude must be a number between -180 and 180';
      }
    }

    return err;
  };

  const handleSubmit = async () => {
    const validation = validate();
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      setError('Please fix validation errors');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {};
      // Only send fields that appear in schemaFields (or defaults)
      const allowed = schemaFields || ['name', 'description', 'address', 'borough', 'latitude', 'longitude'];
      for (const key of allowed) {
        if (typeof form[key] !== 'undefined') payload[key] = form[key];
      }

      if (project && project.id) {
        await axios.put(`/api/projects/${project.id}`, payload);
        setSuccess('Project updated successfully');
      } else {
        await axios.post('/api/projects', payload);
        setSuccess('Project created successfully');
      }

      setTimeout(() => {
        if (onCreated) onCreated();
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to save project');
    } finally {
      setLoading(false);
    }
  };

  const renderField = (field) => {
    const value = form[field];
    const fieldError = errors[field];
    const meta = schemaMeta[field];

    if (meta?.enum_values?.length) {
      return (
        <div key={field}>
          <Label htmlFor={field}>{field.replace(/_/g, ' ').toUpperCase()}</Label>
          <select 
            id={field}
            value={value || ''}
            onChange={(e) => handleChange(field, e.target.value)}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm w-full mt-1"
          >
            <option value="">Select {field}</option>
            {meta.enum_values.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      );
    }

    return (
      <div key={field}>
        <Label htmlFor={field}>{field.replace(/_/g, ' ').toUpperCase()}</Label>
        <Input 
          id={field}
          value={value || ''}
          onChange={(e) => handleChange(field, e.target.value)}
          placeholder={`Enter ${field}`}
          className="mt-1"
        />
        {fieldError && <span className="text-red-600 text-sm mt-1">{fieldError}</span>}
      </div>
    );
  };

  return (
    <div className="create-project">
      <Card>
        <CardHeader>
          <CardTitle>{project ? 'Edit Project' : 'Create a Project'}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 mb-4">Enter project details and pick a location on the map (click to place marker)</p>

          {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}
          {success && <Alert className="mb-4 bg-green-50 border-green-200"><AlertDescription className="text-green-800">{success}</AlertDescription></Alert>}

          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="space-y-4">
                {schemaFields ? (
                  schemaFields.filter(f => f !== 'id' && f !== 'hub_project_id').map(renderField)
                ) : (
                  <p className="text-slate-500">Loading form fields...</p>
                )}

                <div className="pt-4 flex gap-2">
                  <Button onClick={handleSubmit} disabled={loading}>{project ? 'Save Changes' : 'Create Project'}</Button>
                  <Button variant="outline" onClick={() => { if (onCancel) onCancel(); }} disabled={loading}>Cancel</Button>
                  {project && (
                    <>
                      <Button variant="outline" onClick={() => setSiteModalOpen(true)} disabled={loading}>
                        Add Sites ({selectedSites.length})
                      </Button>
                      <Button variant="destructive" onClick={async () => {
                        if (!project?.id) return;
                        if (!window.confirm('Are you sure you want to delete this project?')) return;
                        setLoading(true);
                        try {
                          await axios.delete(`/api/projects/${project.id}`);
                          setSuccess('Project deleted');
                          if (onCreated) onCreated();
                        } catch (err) {
                          setError(err.response?.data?.error || err.message || 'Failed to delete project');
                        } finally {
                          setLoading(false);
                        }
                      }} disabled={loading}>
                        Delete Project
                      </Button>
                    </>
                  )}
                </div>

                {Object.keys(errors).length > 0 && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      <div className="font-medium mb-2">Validation errors</div>
                      <ul className="list-disc pl-4">
                        {Object.values(errors).map((m, i) => <li key={i} className="text-sm">{m}</li>)}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>

            <div>
              <div ref={mapRef} style={{ height: 360, width: '100%', borderRadius: '4px' }} />
              <div className="mt-3 text-sm text-slate-600">
                Click on the map to set the project's location. You can also enter latitude/longitude manually.
              </div>
            </div>
          </div>

          {project && (
            <SiteSelectionModal 
              open={siteModalOpen} 
              onClose={() => setSiteModalOpen(false)} 
              projectId={project.id} 
              onSitesSelected={setSelectedSites}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
