import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Table, Checkbox, Message, Dimmer, Loader } from 'semantic-ui-react';
import axios from 'axios';

export default function SiteSelectionModal({ open, onClose, projectId, onSitesSelected }) {
  const [sites, setSites] = useState([]);
  const [selectedSites, setSelectedSites] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Load all sites on mount
  useEffect(() => {
    if (!open) return;
    loadSites();
  }, [open]);

  // Load selected sites for this project if editing
  useEffect(() => {
    if (!open || !projectId) return;
    loadProjectSites();
  }, [open, projectId]);

  const loadSites = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/table/hub_sites');
      setSites(response.data?.data || []);
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
    const name = (s.site_name || s.name || '').toLowerCase();
    const id = (s.hub_site_id || s.id || '').toString();
    const term = searchTerm.toLowerCase();
    return name.includes(term) || id.includes(term);
  });

  return (
    <Modal open={open} onClose={onClose} size="large">
      <Modal.Header>Select Sites for Project</Modal.Header>
      <Modal.Content scrolling>
        {error && <Message negative content={error} />}
        
        <Input
          placeholder="Search by site name or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ marginBottom: 16, width: '100%' }}
        />

        <Dimmer active={loading} inverted>
          <Loader>Loading sites...</Loader>
        </Dimmer>

        {!loading && (
          <>
            <div style={{ marginBottom: 12 }}>
              <Checkbox
                label={`Select All (${filteredSites.length})`}
                checked={selectedSites.size === filteredSites.length && filteredSites.length > 0}
                onChange={handleSelectAll}
              />
            </div>

            <Table celled compact>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell width={1}></Table.HeaderCell>
                  <Table.HeaderCell>Site ID</Table.HeaderCell>
                  <Table.HeaderCell>Site Name</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredSites.map((site) => {
                  const siteId = site.hub_site_id || site.id;
                  const siteName = site.site_name || site.name || '';
                  return (
                    <Table.Row key={siteId}>
                      <Table.Cell textAlign="center">
                        <Checkbox
                          checked={selectedSites.has(siteId)}
                          onChange={() => handleToggleSite(siteId)}
                        />
                      </Table.Cell>
                      <Table.Cell>{siteId}</Table.Cell>
                      <Table.Cell>{siteName}</Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table>

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
