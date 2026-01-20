import React, { useState, useRef, useEffect } from 'react';
import { Segment, Header, Form, Button, Grid, Message } from 'semantic-ui-react';
import axios from 'axios';
import './CreateProject.css';
import SiteSelectionModal from './SiteSelectionModal';
import AddSitesModal from './AddSitesModal';
import AttributeSelectionModal from './AttributeSelectionModal';

export default function CreateProject({ onCreated, onCancel, project, onViewSiteDetail }) {
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
  const [addSitesModalOpen, setAddSitesModalOpen] = useState(false);
  const [selectedSites, setSelectedSites] = useState([]);
  const [attributeModalOpen, setAttributeModalOpen] = useState(false);
  const [selectedAttributes, setSelectedAttributes] = useState([]);

  const mapRef = useRef();
  const mapViewRef = useRef();

  // Initialize ArcGIS map
  useEffect(() => {
    let retries = 0;
    let viewInstance = null;

    const initializeMap = (Map, MapView, Extent) => {
      if (!mapRef.current) return;
      try {
        if (mapViewRef.current) {
          try { mapViewRef.current.destroy(); } catch (e) {}
        }
        const map = new Map({ basemap: 'arcgis-streets' });
        const nycExtent = new Extent({ xmin: -74.256, ymin: 40.496, xmax: -73.700, ymax: 40.916, spatialReference: { wkid: 4326 } });
        const view = new MapView({ container: mapRef.current, map, extent: nycExtent });
        mapViewRef.current = view;
        viewInstance = view;
        view.on('click', (event) => {
          const point = view.toMap({ x: event.x, y: event.y });
          setPosition({ lat: point.latitude, lng: point.longitude });
        });
        view.when(() => {}).catch((err) => console.error('Map view error:', err));
      } catch (err) { console.error('Error creating map:', err); }
    };

    const tryInitialize = () => {
      retries++;
      if (!mapRef.current || !window.require) {
        if (retries < 30) setTimeout(tryInitialize, 100);
        return;
      }
      window.require(['esri/Map', 'esri/views/MapView', 'esri/geometry/Extent'], initializeMap);
    };
    tryInitialize();

    return () => {
      if (viewInstance) {
        try { viewInstance.destroy(); viewInstance = null; mapViewRef.current = null; } catch (e) {}
      }
    };
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

  // Load selected site attributes for the project
  useEffect(() => {
    if (!project?.id) return;
    (async () => {
      try {
        const response = await axios.get(`/api/projects/${project.id}/site-attributes`);
        const projectAttrs = response.data?.data || [];
        setSelectedAttributes(projectAttrs.map(pa => pa.attribute_id));
      } catch (err) {
        console.error('Failed to load project site attributes:', err);
      }
    })();
  }, [project?.id]);

  // Load and display site geometries on map when selected sites change
  useEffect(() => {
    if (!selectedSites.length || !mapViewRef.current || !window.require) return;

    (async () => {
      try {
        const response = await axios.get('/api/table/sat_site_geometry', { params: { limit: 5000 } });
        const allGeoms = response.data?.data || [];
        const siteGeoms = allGeoms.filter(g => g && selectedSites.some(id => String(id) === String(g.hub_site_id)));

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
                let geomData = geom.geometry ?? geom.shape ?? geom.geom ?? geom.the_geom;
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
        
        // Remove previous marker if it exists
        mapViewRef.current.graphics.removeAll();
        
        // Add new marker
        const marker = new Graphic({
          geometry: point,
          symbol: {
            type: 'simple-marker',
            color: [226, 119, 40],
            size: 12
          }
        });
        mapViewRef.current.graphics.add(marker);
        
        // Center map on marker
        mapViewRef.current.center = point;
      });
    }
  };

  const handleChange = (e, { name, value }) => {
    setForm(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: undefined }));
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

      if (onCreated) onCreated();

      // Reset fields only after create (if editing, keep values)
      if (!project) setForm({ name: '', description: '', address: '', borough: '', latitude: null, longitude: null });
      setErrors({});
    } catch (err) {
      console.error('CreateProject submit error', err);
      setError(err.response?.data?.error || err.message || 'Failed to save project');
    } finally {
      setLoading(false);
    }
  };

  // Render input for a given field name
  const renderField = (field) => {
    const value = form[field] ?? '';
    const fieldError = errors[field];
    const meta = schemaMeta[field] || {};

    // If enum metadata exists, render a select
    if (meta?.enum_values && Array.isArray(meta.enum_values) && meta.enum_values.length > 0) {
      const options = meta.enum_values.map(v => ({ key: v, value: v, text: v }));
      return (
        <Form.Select key={field} name={field} label={field.replace(/_/g, ' ')} options={options} value={value} onChange={handleChange} error={!!fieldError} />
      );
    }

    // heuristics for field types
    if (field === 'description' || field === 'notes' || field === 'summary') {
      return (
        <Form.TextArea key={field} name={field} label={field.replace(/_/g, ' ')} value={value} onChange={handleChange} error={!!fieldError} />
      );
    }

    if (field === 'latitude' || field === 'longitude' || meta?.data_type === 'numeric' || (meta?.data_type && meta.data_type.toLowerCase().includes('int'))) {
      return (
        <Form.Input
          key={field}
          name={field}
          label={field.replace(/_/g, ' ')}
          type="number"
          value={value}
          onChange={(e, { name, value }) => setForm(prev => ({ ...prev, [name]: value !== '' ? parseFloat(value) : null }))}
          error={!!fieldError}
        />
      );
    }

    return (
      <Form.Input key={field} name={field} label={field.replace(/_/g, ' ')} value={value} onChange={handleChange} error={!!fieldError} />
    );
  };

  return (
    <div className="create-project">
      <Segment>
        <Header as="h2">{project ? 'Edit Project' : 'Create a Project'}</Header>
        <p className="muted">Enter project details and pick a location on the map (click to place marker)</p>

        {error && <Message negative content={error} />}
        {success && <Message positive content={success} />}

        <Grid columns={2} stackable>
          <Grid.Column width={8}>
            <Form>
              {schemaFields ? (
                schemaFields.filter(f => f !== 'id' && f !== 'hub_project_id').map(renderField)
              ) : (
                <p style={{ color: 'var(--text-dim)' }}>Loading form fields...</p>
              )}

              <div style={{ marginTop: 12 }}>
                <Button primary onClick={handleSubmit} loading={loading} disabled={loading}>{project ? 'Save Changes' : 'Create Project'}</Button>
                <Button onClick={() => { if (onCancel) onCancel(); }} disabled={loading} style={{ marginLeft: 8 }}>Cancel</Button>
                {project && (
                  <>
                    <Button onClick={() => setAddSitesModalOpen(true)} style={{ marginLeft: 8 }}>
                      Add Sites
                    </Button>
                    <Button onClick={() => setSiteModalOpen(true)} style={{ marginLeft: 8 }}>
                      View Sites ({selectedSites.length})
                    </Button>
                    <Button onClick={() => setAttributeModalOpen(true)} style={{ marginLeft: 8 }}>
                      Site Attributes ({selectedAttributes.length})
                    </Button>
                    <Button color="red" onClick={async () => {
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
                    }} loading={loading} disabled={loading} style={{ marginLeft: 8 }}>
                      Delete Project
                    </Button>
                  </>

                )}
              </div>
            </Form>

            {/* Inline validation list */}
            {Object.keys(errors).length > 0 && (
              <Message negative>
                <Message.Header>Validation errors</Message.Header>
                <Message.List>
                  {Object.values(errors).map((m, i) => <Message.Item key={i}>{m}</Message.Item>)}
                </Message.List>
              </Message>
            )}

          </Grid.Column>

          <Grid.Column width={8}>
            <div ref={mapRef} style={{ height: 360, width: '100%', borderRadius: '4px', minHeight: '360px', background: 'var(--bg-secondary)' }} />
            <div className="map-note" style={{ marginTop: 8, color: 'var(--text-dim)' }}>
              Click on the map to set the project's location. You can also enter latitude/longitude manually.
            </div>
          </Grid.Column>
        </Grid>

        {project && (
          <SiteSelectionModal 
            open={siteModalOpen} 
            onClose={() => setSiteModalOpen(false)} 
            projectId={project.id}
            onViewSiteDetail={onViewSiteDetail ? (site) => onViewSiteDetail(site, 'create-project') : undefined}
          />
        )}

        {project && (
          <AddSitesModal
            open={addSitesModalOpen}
            onClose={() => setAddSitesModalOpen(false)}
            projectId={project.id}
            onSitesUpdated={setSelectedSites}
            onViewSiteDetail={onViewSiteDetail ? (site) => onViewSiteDetail(site, 'create-project') : undefined}
          />
        )}

        {project && (
          <AttributeSelectionModal
            open={attributeModalOpen}
            onClose={() => setAttributeModalOpen(false)}
            projectId={project.id}
            onAttributesSelected={setSelectedAttributes}
          />
        )}
      </Segment>
    </div>
  );
}
