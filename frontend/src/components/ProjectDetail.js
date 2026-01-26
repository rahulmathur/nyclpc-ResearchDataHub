import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { Segment, Header, List, Loader, Message, Button, Grid, Table, Modal, Pagination, Select } from 'semantic-ui-react';
import SiteDetail from './SiteDetail';
import ProjectDetailMap from './ProjectDetailMap';
import './ProjectDetail.css';

function ProjectDetail({ onViewSiteDetail }) {
  const [step, setStep] = useState(1);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingSites, setLoadingSites] = useState(false);
  const [error, setError] = useState(null);
  const [lastProjectsRaw, setLastProjectsRaw] = useState(null);
  const [siteDetailModalOpen, setSiteDetailModalOpen] = useState(false);
  const [siteToView, setSiteToView] = useState(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalSites, setTotalSites] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const projectsRef = useRef(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (step === 1 && projectsRef.current) {
      const firstItem = projectsRef.current.querySelector('[role="button"]');
      if (firstItem && typeof firstItem.focus === 'function') firstItem.focus();
    }
  }, [step, projects]);

  const getId = (obj) => obj?.id ?? obj?.hub_project_id ?? obj?.hub_site_id ?? obj?._id ?? obj?.project_id ?? obj?.site_id ?? null;
  const getName = (obj) => obj?.name ?? obj?.title ?? `#${getId(obj)}`;

  const loadProjects = async () => {
    setLoadingProjects(true);
    setError(null);

    try {
      const res = await axios.get('/api/projects');
      setLastProjectsRaw(res.data);
      setProjects(res.data.data || []);
    } catch (err) {
      console.error('loadProjects error', err);
      setError(err.response?.data?.error || err.message || 'Failed to load projects');
      setLastProjectsRaw(err.response?.data || { error: err.message });
    } finally {
      setLoadingProjects(false);
    }
  };

  const loadSites = useCallback(async (projectId, page = 1, limit = pageSize) => {
    if (!projectId) return;
    
    setLoadingSites(true);
    setError(null);
    try {
      const offset = (page - 1) * limit;
      const res = await axios.get(`/api/projects/${encodeURIComponent(projectId)}/sites?limit=${limit}&offset=${offset}`);
      setSites(res.data.data || []);
      
      // Update pagination info
      if (res.data.pagination) {
        setTotalSites(res.data.pagination.total);
        setTotalPages(res.data.pagination.totalPages);
        setCurrentPage(res.data.pagination.page);
      }
    } catch (err) {
      console.error('loadSites error', err);
      setError(err.response?.data?.error || err.message || 'Failed to load sites for project');
    } finally {
      setLoadingSites(false);
    }
  }, [pageSize]);

  const selectProject = async (project) => {
    setSelectedProject(project);
    setSelectedSite(null);
    setCurrentPage(1);
    setStep(2);

    const projectId = getId(project);
    if (!projectId) {
      setError('Selected project has no identifiable id');
      return;
    }

    await loadSites(projectId, 1, pageSize);
  };
  
  const handlePageChange = (e, { activePage }) => {
    setCurrentPage(activePage);
    loadSites(getId(selectedProject), activePage, pageSize);
  };
  
  const handlePageSizeChange = (e, { value }) => {
    setPageSize(value);
    setCurrentPage(1);
    loadSites(getId(selectedProject), 1, value);
  };

  const confirm = () => {
    if (!selectedProject || !selectedSite) {
      setError('Please select a project and site before confirming');
      return;
    }
    alert(`Selected project: ${getName(selectedProject)} (${getId(selectedProject)})\nSelected site: ${getName(selectedSite)} (${getId(selectedSite)})`);
  };

  const openSiteDetails = (site, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // If onViewSiteDetail callback is provided, navigate to site detail page
    // Otherwise, open in modal (fallback for standalone usage)
    if (onViewSiteDetail) {
      onViewSiteDetail(site, 'project-detail');
    } else {
      setSiteToView(site);
      setSiteDetailModalOpen(true);
    }
  };

  const closeSiteDetails = () => {
    setSiteDetailModalOpen(false);
    setSiteToView(null);
  };

  return (
    <div className="project-detail">
      <Segment>
        <Grid columns={2} verticalAlign="middle">
          <Grid.Column>
            <Header as="h2">Project → Site Wizard</Header>
          </Grid.Column>
          <Grid.Column textAlign="right">
            <div className="project-detail-steps">Step {step} of 2</div>
          </Grid.Column>
        </Grid>

        {error && <Message negative content={error} />}

        {step === 1 && (
          <div className="project-detail-step">
            <Header as="h4">Select a project from the list below</Header>

            {loadingProjects ? (
              <Loader active inline="centered">Loading projects...</Loader>
            ) : projects.length === 0 ? (
              <div className="empty">
                <Message info>
                  <Message.Header>No projects found</Message.Header>
                  <p>If you expect projects to exist, confirm the backend `/api/projects` response.</p>
                </Message>
                {lastProjectsRaw && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer' }}>Show raw API response</summary>
                    <pre style={{ maxHeight: 200, overflow: 'auto', background: '#0a0a0a', padding: 8, borderRadius: 6 }}>{JSON.stringify(lastProjectsRaw, null, 2)}</pre>
                  </details>
                )}
              </div>
            ) : (
              <div ref={projectsRef} className="project-list-container" aria-label="Project list">
                <List selection divided>
                {projects.map((p, idx) => (
                  <List.Item
                    key={getId(p) || `p-${idx}`}
                    onClick={() => selectProject(p)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectProject(p); }}
                    aria-label={`Select project ${getName(p)}`}
                  >
                    <List.Content>
                      <List.Header>{getName(p)}</List.Header>
                      <List.Description>ID: {getId(p)}</List.Description>
                    </List.Content>
                  </List.Item>
                ))}
                </List>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="project-detail-step">
            <Header as="h4">Selected project: <strong>{selectedProject?.project_nm || selectedProject?.name || selectedProject?.id}</strong></Header>
            <p>Select a site linked to this project.</p>

            {/* Clustered Map */}
            {selectedProject && (
              <div style={{ marginBottom: '16px', position: 'relative' }}>
                <ProjectDetailMap 
                  projectId={getId(selectedProject)}
                  onClusterClick={(cluster) => {
                    console.log('Cluster clicked:', cluster);
                    // Could filter table or zoom to specific sites
                  }}
                />
              </div>
            )}

            {loadingSites ? (
              <Loader active inline="centered">Loading sites...</Loader>
            ) : sites.length === 0 ? (
              <Message info content="No sites found for this project" />
            ) : (
              <div className="project-sites-table-wrap">
                <Table celled selectable compact>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Site ID</Table.HeaderCell>
                      <Table.HeaderCell>BIN</Table.HeaderCell>
                      <Table.HeaderCell>BBL</Table.HeaderCell>
                      <Table.HeaderCell>Actions</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {sites.map((s, idx) => (
                      <Table.Row 
                        key={getId(s) || `s-${idx}`}
                        onClick={() => setSelectedSite(s)}
                        active={getId(selectedSite) === getId(s)}
                        style={{ cursor: 'pointer' }}
                      >
                        <Table.Cell>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openSiteDetails(s, e);
                            }}
                            className="site-id-link"
                            aria-label={`View details for site ${getId(s)}`}
                          >
                            {getId(s)}
                          </button>
                        </Table.Cell>
                        <Table.Cell>{s.bin || '—'}</Table.Cell>
                        <Table.Cell>{s.bbl || '—'}</Table.Cell>
                        <Table.Cell>
                          <Button 
                            size="mini" 
                            primary 
                            onClick={(e) => {
                              e.stopPropagation();
                              openSiteDetails(s, e);
                            }}
                          >
                            View
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
                
                {/* Pagination Controls */}
                <div className="pagination-controls" style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginTop: '16px',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#888', fontSize: '13px' }}>
                      Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalSites)} of {totalSites.toLocaleString()} sites
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
                  
                  {totalPages > 1 && (
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
                      size="mini"
                    />
                  )}
                </div>
              </div>
            )}

            <div className="project-detail-actions" style={{ marginTop: 12 }}>
              <Button onClick={() => setStep(1)}>← Back</Button>
              <Button primary onClick={confirm} disabled={!selectedSite}>Confirm</Button>
            </div>
          </div>
        )}
      </Segment>

      <Modal
        open={siteDetailModalOpen}
        onClose={closeSiteDetails}
        size="fullscreen"
        closeIcon
      >
        <Modal.Content scrolling>
          {siteToView && <SiteDetail site={siteToView} onBack={closeSiteDetails} hideSatelliteData />}
        </Modal.Content>
      </Modal>
    </div>
  );
}

export default ProjectDetail;
