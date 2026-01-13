import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Table, Message, Dimmer, Loader } from 'semantic-ui-react';
import axios from 'axios';

export default function SiteSelectionModal({ open, onClose, projectId }) {
  const [sites, setSites] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Load sites with attributes on open
  useEffect(() => {
    if (!open || !projectId) return;
    loadSitesWithAttributes();
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
      <Modal.Header>Project Sites ({sites.length} sites)</Modal.Header>
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
          <Loader>Loading project sites...</Loader>
        </Dimmer>

        {!loading && (
          <>
            {attributes.length === 0 && sites.length > 0 && (
              <Message info size="small" style={{ marginBottom: 12 }}>
                No site attributes selected for this project. Use "Site Attributes" to select which attributes to display.
              </Message>
            )}
            
            {sites.length === 0 && (
              <Message info>
                No sites linked to this project yet.
              </Message>
            )}

            {sites.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <Table celled compact striped>
                  <Table.Header>
                    <Table.Row>
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
            )}

            {filteredSites.length === 0 && sites.length > 0 && !loading && (
              <Message info content="No sites found matching your search." />
            )}
          </>
        )}
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={onClose}>Close</Button>
      </Modal.Actions>
    </Modal>
  );
}
