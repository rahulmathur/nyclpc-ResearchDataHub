import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Input, Table, Message, Dimmer, Loader, Checkbox } from 'semantic-ui-react';
import axios from 'axios';

export default function AddSitesModal({ open, onClose, projectId, onSitesUpdated }) {
  const [allSites, setAllSites] = useState([]);
  const [selectedSiteIds, setSelectedSiteIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Load all sites and currently linked sites
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all available sites
      const allSitesRes = await axios.get('/api/sites');
      setAllSites(allSitesRes.data?.data || []);

      // Fetch currently linked sites for this project
      const linkedRes = await axios.get(`/api/projects/${projectId}/sites`);
      const linkedSites = linkedRes.data?.data || [];
      const linkedIds = new Set(linkedSites.map(s => s.hub_site_id || s.id));
      setSelectedSiteIds(linkedIds);
    } catch (err) {
      setError('Failed to load sites');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open && projectId) {
      loadData();
    }
  }, [open, projectId, loadData]);

  const toggleSite = (siteId) => {
    setSelectedSiteIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(siteId)) {
        newSet.delete(siteId);
      } else {
        newSet.add(siteId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    const filteredIds = filteredSites.map(s => s.hub_site_id || s.id);
    setSelectedSiteIds(prev => {
      const newSet = new Set(prev);
      filteredIds.forEach(id => newSet.add(id));
      return newSet;
    });
  };

  const deselectAll = () => {
    const filteredIds = filteredSites.map(s => s.hub_site_id || s.id);
    setSelectedSiteIds(prev => {
      const newSet = new Set(prev);
      filteredIds.forEach(id => newSet.delete(id));
      return newSet;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await axios.put(`/api/projects/${projectId}/sites`, {
        siteIds: Array.from(selectedSiteIds)
      });
      if (onSitesUpdated) onSitesUpdated(Array.from(selectedSiteIds));
      onClose();
    } catch (err) {
      setError('Failed to save site selection');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const filteredSites = allSites.filter(s => {
    const siteId = (s.hub_site_id || s.id || '').toString();
    return siteId.includes(searchTerm.toLowerCase());
  });

  const selectedCount = selectedSiteIds.size;
  const filteredSelectedCount = filteredSites.filter(s => selectedSiteIds.has(s.hub_site_id || s.id)).length;

  return (
    <Modal open={open} onClose={onClose} size="large">
      <Modal.Header>Add Sites to Project</Modal.Header>
      <Modal.Content scrolling>
        {error && <Message negative content={error} />}
        
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Input
            placeholder="Search by site ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: 1 }}
            icon="search"
          />
          <span style={{ color: '#666' }}>
            {selectedCount} site{selectedCount !== 1 ? 's' : ''} selected
          </span>
        </div>

        <div style={{ marginBottom: 12 }}>
          <Button size="small" onClick={selectAll}>
            Select All Visible ({filteredSites.length})
          </Button>
          <Button size="small" onClick={deselectAll} style={{ marginLeft: 8 }}>
            Deselect All Visible
          </Button>
        </div>

        <Dimmer active={loading} inverted>
          <Loader>Loading sites...</Loader>
        </Dimmer>

        {!loading && (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <Table celled compact striped>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell style={{ width: 50 }}>
                    <Checkbox
                      checked={filteredSelectedCount === filteredSites.length && filteredSites.length > 0}
                      indeterminate={filteredSelectedCount > 0 && filteredSelectedCount < filteredSites.length}
                      onChange={() => {
                        if (filteredSelectedCount === filteredSites.length) {
                          deselectAll();
                        } else {
                          selectAll();
                        }
                      }}
                    />
                  </Table.HeaderCell>
                  <Table.HeaderCell>Site ID</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredSites.map((site) => {
                  const siteId = site.hub_site_id || site.id;
                  const isSelected = selectedSiteIds.has(siteId);
                  return (
                    <Table.Row key={siteId} onClick={() => toggleSite(siteId)} style={{ cursor: 'pointer' }}>
                      <Table.Cell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={isSelected} onChange={() => toggleSite(siteId)} />
                      </Table.Cell>
                      <Table.Cell>{siteId}</Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table>
          </div>
        )}

        {filteredSites.length === 0 && !loading && (
          <Message info content="No sites found matching your search." />
        )}
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button primary onClick={handleSave} loading={saving} disabled={saving}>
          Save Selection ({selectedCount} sites)
        </Button>
      </Modal.Actions>
    </Modal>
  );
}
