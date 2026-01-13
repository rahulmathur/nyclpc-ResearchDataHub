import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Table, Checkbox, Message, Dimmer, Loader } from 'semantic-ui-react';
import axios from 'axios';

export default function SiteSelectionModal({ open, onClose, projectId, onSitesSelected }) {
  const [sites, setSites] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [selectedSites, setSelectedSites] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Load sites with attributes on open
  useEffect(() => {
    if (!open || !projectId) return;
    loadSitesWithAttributes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  // Load selected sites for this project if editing
  useEffect(() => {
    if (!open || !projectId) return;
    loadProjectSites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const loadSitesWithAttributes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/api/projects/${projectId}/sites-with-attributes`);
      setSites(response.data?.data || []);
      setAttributes(response.data?.attributes || []);
    } catch (err) {
      setError('Failed to load sites');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadProjectSites = async () => {
    try {
      const response = await axios.get('/api/table/lnk_project_site');
      const projectSites = response.data?.data?.filter(ps => ps.hub_project_id === projectId) || [];
      setSelectedSites(new Set(projectSites.map(ps => ps.hub_site_id)));
    } catch (err) {
      console.error('Failed to load project sites:', err);
    }
  };

  const handleToggleSite = (siteId) => {
    const newSelected = new Set(selectedSites);
    if (newSelected.has(siteId)) {
      newSelected.delete(siteId);
    } else {
      newSelected.add(siteId);
    }
    setSelectedSites(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedSites.size === filteredSites.length) {
      setSelectedSites(new Set());
    } else {
      setSelectedSites(new Set(filteredSites.map(s => s.hub_site_id || s.id)));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Delete existing links for this project
      const existing = await axios.get('/api/table/lnk_project_site');
      const projectLinks = existing.data?.data?.filter(ps => ps.hub_project_id === projectId) || [];
      
      for (const link of projectLinks) {
        await axios.delete(`/api/table/lnk_project_site/${link.lnk_project_site_id || link.id}`);
      }

      // Add new links
      for (const siteId of selectedSites) {
        await axios.post('/api/table/lnk_project_site', {
          hub_project_id: projectId,
          hub_site_id: siteId
        });
      }

      if (onSitesSelected) onSitesSelected(Array.from(selectedSites));
      onClose();
    } catch (err) {
      setError('Failed to save site selections');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const filteredSites = sites.filter(s => {
    const id = (s.hub_site_id || s.id || '').toString();
    const term = searchTerm.toLowerCase();
    
    // Also search in attribute values
    let attrMatch = false;
    for (const attr of attributes) {
      const val = (s[attr.key] || '').toLowerCase();
      if (val.includes(term)) {
        attrMatch = true;
        break;
      }
    }
    
    return id.includes(term) || attrMatch;
  });

  return (
    <Modal open={open} onClose={onClose} size="fullscreen">
      <Modal.Header>Select Sites for Project</Modal.Header>
      <Modal.Content scrolling>
        {error && <Message negative content={error} />}
        
        <Input
          placeholder="Search by site ID or attribute values..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ marginBottom: 16, width: '100%' }}
          icon="search"
        />

        <Dimmer active={loading} inverted>
          <Loader>Loading sites with attributes...</Loader>
        </Dimmer>

        {!loading && (
          <>
            <div style={{ marginBottom: 12 }}>
              <Checkbox
                label={`Select All (${filteredSites.length})`}
                checked={selectedSites.size === filteredSites.length && filteredSites.length > 0}
                onChange={handleSelectAll}
              />
              {attributes.length === 0 && (
                <Message info size="small" style={{ marginTop: 8 }}>
                  No site attributes selected for this project. Use "Site Attributes" to select which attributes to display.
                </Message>
              )}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <Table celled compact striped>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell style={{ width: 50 }}></Table.HeaderCell>
                    <Table.HeaderCell style={{ minWidth: 80 }}>Site ID</Table.HeaderCell>
                    {attributes.map(attr => (
                      <Table.HeaderCell key={attr.id} style={{ minWidth: 120 }}>
                        {attr.name}
                      </Table.HeaderCell>
                    ))}
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {filteredSites.map((site) => {
                    const siteId = site.hub_site_id || site.id;
                    return (
                      <Table.Row key={siteId}>
                        <Table.Cell textAlign="center">
                          <Checkbox
                            checked={selectedSites.has(siteId)}
                            onChange={() => handleToggleSite(siteId)}
                          />
                        </Table.Cell>
                        <Table.Cell>{siteId}</Table.Cell>
                        {attributes.map(attr => (
                          <Table.Cell key={attr.id} style={{ 
                            maxWidth: 250, 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }} title={site[attr.key] || ''}>
                            {site[attr.key] || <span style={{ color: '#999' }}>-</span>}
                          </Table.Cell>
                        ))}
                      </Table.Row>
                    );
                  })}
                </Table.Body>
              </Table>
            </div>

            {filteredSites.length === 0 && !loading && (
              <Message info content="No sites found matching your search." />
            )}
          </>
        )}
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={onClose}>Cancel</Button>
        <Button primary onClick={handleSave} loading={saving} disabled={saving}>
          Save Selection ({selectedSites.size} selected)
        </Button>
      </Modal.Actions>
    </Modal>
  );
}
