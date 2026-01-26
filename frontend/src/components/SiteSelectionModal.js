import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Input, Table, Message, Dimmer, Loader, Pagination, Select } from 'semantic-ui-react';
import axios from 'axios';

export default function SiteSelectionModal({ open, onClose, projectId, onViewSiteDetail }) {
  const [sites, setSites] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalSites, setTotalSites] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const loadSitesWithAttributes = useCallback(async (page = 1, limit = pageSize) => {
    setLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * limit;
      const response = await axios.get(`/api/projects/${projectId}/sites-with-attributes?limit=${limit}&offset=${offset}`);
      setSites(response.data?.data || []);
      setAttributes(response.data?.attributes || []);
      
      // Update pagination info
      if (response.data?.pagination) {
        setTotalSites(response.data.pagination.total);
        setTotalPages(response.data.pagination.totalPages);
        setCurrentPage(response.data.pagination.page);
      }
    } catch (err) {
      setError('Failed to load sites');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId, pageSize]);

  // Load sites with attributes on open
  useEffect(() => {
    if (!open || !projectId) return;
    setCurrentPage(1);
    loadSitesWithAttributes(1, pageSize);
  }, [open, projectId, loadSitesWithAttributes, pageSize]);

  const handlePageChange = (e, { activePage }) => {
    setCurrentPage(activePage);
    loadSitesWithAttributes(activePage, pageSize);
  };
  
  const handlePageSizeChange = (e, { value }) => {
    setPageSize(value);
    setCurrentPage(1);
    loadSitesWithAttributes(1, value);
  };

  // Client-side filtering for current page only
  const filteredSites = sites.filter(s => {
    if (!searchTerm) return true;
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
      <Modal.Header>Project Sites ({totalSites.toLocaleString()} sites)</Modal.Header>
      <Modal.Content scrolling>
        {error && <Message negative content={error} />}
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: '12px' }}>
          <Input
            placeholder="Search current page..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ minWidth: 250 }}
            icon="search"
          />
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#888', fontSize: '13px' }}>
              Page {currentPage} of {totalPages.toLocaleString()} ({totalSites.toLocaleString()} total)
            </span>
            <Select
              compact
              options={[
                { key: 25, value: 25, text: '25 per page' },
                { key: 50, value: 50, text: '50 per page' },
                { key: 100, value: 100, text: '100 per page' },
                { key: 250, value: 250, text: '250 per page' },
              ]}
              value={pageSize}
              onChange={handlePageSizeChange}
              style={{ minWidth: '120px' }}
            />
          </div>
        </div>

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
                      const handleSiteIdClick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onViewSiteDetail) {
                          onViewSiteDetail(site);
                        }
                      };
                      return (
                        <Table.Row key={siteId}>
                          <Table.Cell>
                            {onViewSiteDetail ? (
                              <button
                                type="button"
                                onClick={handleSiteIdClick}
                                className="site-id-link"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  textDecoration: 'underline',
                                  cursor: 'pointer',
                                  fontWeight: '500',
                                  color: '#00ccff',
                                  transition: 'color 0.2s ease',
                                  font: 'inherit'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = '#00ff88';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = '#00ccff';
                                }}
                                aria-label={`View details for site ${siteId}`}
                              >
                                {siteId}
                              </button>
                            ) : (
                              siteId
                            )}
                          </Table.Cell>
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
                
                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    marginTop: '16px',
                    paddingTop: '16px',
                    borderTop: '1px solid rgba(255,255,255,0.1)'
                  }}>
                    <Pagination
                      activePage={currentPage}
                      totalPages={totalPages}
                      onPageChange={handlePageChange}
                      ellipsisItem={{ content: '...', disabled: true }}
                      firstItem={totalPages > 5 ? { content: '«', icon: true } : null}
                      lastItem={totalPages > 5 ? { content: '»', icon: true } : null}
                      prevItem={{ content: '‹', icon: true }}
                      nextItem={{ content: '›', icon: true }}
                      siblingRange={1}
                      boundaryRange={1}
                    />
                  </div>
                )}
              </div>
            )}

            {filteredSites.length === 0 && sites.length > 0 && !loading && (
              <Message info content="No sites found matching your search on this page." />
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
