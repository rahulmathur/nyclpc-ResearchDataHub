import React, { useState, useEffect, useRef } from 'react';
import { Segment, Header, Form, Button, Grid, Message, Icon } from 'semantic-ui-react';
import axios from 'axios';
import './CreateProject.css';
import CreateProjectMap from './CreateProjectMap';
import ProjectDetailMap from './ProjectDetailMap';
import SiteSelectionModal from './SiteSelectionModal';
import AddSitesModal from './AddSitesModal';
import AttributeSelectionModal from './AttributeSelectionModal';
import ProjectFiles from './ProjectFiles';

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
  const [filesModalOpen, setFilesModalOpen] = useState(false);
  
  // Shapefile upload state
  const [shapefile, setShapefile] = useState(null);
  const [linkedSitesCount, setLinkedSitesCount] = useState(null);
  const fileInputRef = useRef(null);

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
    }
  }, [project, schemaFields]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load selected sites count and IDs for the project
  useEffect(() => {
    if (!project?.id) return;
    (async () => {
      try {
        // Fetch with limit=0 to just get the count, or small limit for IDs
        const response = await axios.get(`/api/projects/${project.id}/sites?limit=1000`);
        const sites = response.data?.data || [];
        const pagination = response.data?.pagination;
        
        // Set the total count from pagination
        if (pagination?.total) {
          setLinkedSitesCount(pagination.total);
        } else {
          setLinkedSitesCount(sites.length);
        }
        
        // Store site IDs (up to 1000 for map display)
        setSelectedSites(sites.map(s => s.hub_site_id || s.id));
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

  const setPosition = ({ lat, lng }) => {
    setForm(prev => ({ ...prev, latitude: lat, longitude: lng }));
    setErrors(prev => ({ ...prev, latitude: undefined, longitude: undefined }));
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

  const handleShapefileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.zip')) {
        setError('Please upload a .zip file containing shapefile components (.shp, .shx, .dbf)');
        setShapefile(null);
        return;
      }
      setShapefile(file);
      setError(null);
    } else {
      setShapefile(null);
    }
  };

  const clearShapefile = () => {
    setShapefile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
    setLinkedSitesCount(null);
    
    try {
      const payload = {};
      // Only send fields that appear in schemaFields (or defaults)
      const allowed = schemaFields || ['name', 'description', 'address', 'borough', 'latitude', 'longitude'];
      for (const key of allowed) {
        if (typeof form[key] !== 'undefined') payload[key] = form[key];
      }

      if (project && project.id) {
        // Editing existing project - no shapefile support
        await axios.put(`/api/projects/${project.id}`, payload);
        setSuccess('Project updated successfully');
      } else {
        // Creating new project
        if (shapefile) {
          // Use FormData for multipart upload with shapefile
          const formData = new FormData();
          formData.append('shapefile', shapefile);
          formData.append('projectData', JSON.stringify(payload));
          
          const response = await axios.post('/api/projects/with-shapefile', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          
          const linkedCount = response.data?.linkedSitesCount || 0;
          const shapefileError = response.data?.shapefileError;
          
          setLinkedSitesCount(linkedCount);
          
          if (shapefileError) {
            setSuccess(`Project created, but shapefile processing failed: ${shapefileError}`);
          } else if (linkedCount > 0) {
            setSuccess(`Project created successfully! ${linkedCount} site${linkedCount !== 1 ? 's' : ''} linked from shapefile.`);
          } else {
            setSuccess('Project created successfully. No sites found within the shapefile boundary.');
          }
        } else {
          // Regular create without shapefile
          await axios.post('/api/projects', payload);
          setSuccess('Project created successfully');
        }
      }

      if (onCreated) onCreated();

      // Reset fields only after create (if editing, keep values)
      if (!project) {
        setForm({ name: '', description: '', address: '', borough: '', latitude: null, longitude: null });
        setShapefile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
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

              {/* Shapefile upload - only shown when creating new project */}
              {!project && (
                <Form.Field style={{ marginTop: 16 }}>
                  <label>Import Sites from Shapefile (optional)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".zip"
                      onChange={handleShapefileChange}
                      style={{ flex: 1 }}
                    />
                    {shapefile && (
                      <Button
                        icon
                        size="small"
                        type="button"
                        onClick={clearShapefile}
                        title="Clear selected file"
                      >
                        <Icon name="close" />
                      </Button>
                    )}
                  </div>
                  {shapefile && (
                    <p style={{ color: 'var(--brand-primary)', marginTop: 4, fontSize: '0.9em' }}>
                      <Icon name="file archive" /> {shapefile.name} ({(shapefile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                  <p style={{ color: 'var(--text-dim)', marginTop: 4, fontSize: '0.85em' }}>
                    Upload a .zip file containing .shp, .shx, and .dbf files. Sites that intersect the shapefile boundary will be automatically linked to this project.
                  </p>
                </Form.Field>
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
                      View Sites ({linkedSitesCount !== null ? linkedSitesCount.toLocaleString() : selectedSites.length})
                    </Button>
                    <Button onClick={() => setAttributeModalOpen(true)} style={{ marginLeft: 8 }}>
                      Site Attributes ({selectedAttributes.length})
                    </Button>
                    <Button onClick={() => setFilesModalOpen(true)} style={{ marginLeft: 8 }}>
                      <Icon name="cloud" />
                      Manage Files
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
            {/* Show all sites map when editing a project with sites */}
            {project?.id && linkedSitesCount > 0 ? (
              <>
                <ProjectDetailMap 
                  projectId={project.id}
                />
                <div className="map-note" style={{ marginTop: 8, color: 'var(--text-dim)' }}>
                  Showing {linkedSitesCount?.toLocaleString()} sites
                </div>
              </>
            ) : (
              <>
                <CreateProjectMap
                  siteIds={selectedSites}
                  latitude={form.latitude}
                  longitude={form.longitude}
                  onPositionChange={setPosition}
                  height={360}
                />
                <div className="map-note" style={{ marginTop: 8, color: 'var(--text-dim)' }}>
                  Click on the map to set the project's location. You can also enter latitude/longitude manually.
                </div>
              </>
            )}
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

        {project && (
          <ProjectFiles
            open={filesModalOpen}
            onClose={() => setFilesModalOpen(false)}
            projectId={project.id}
          />
        )}
      </Segment>
    </div>
  );
}
