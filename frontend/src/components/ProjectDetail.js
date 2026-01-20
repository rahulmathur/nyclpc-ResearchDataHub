import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Segment, Header, List, Loader, Message, Button, Grid, Card, Modal } from 'semantic-ui-react';
import SiteDetail from './SiteDetail';
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

  const selectProject = async (project) => {
    setSelectedProject(project);
    setSelectedSite(null);
    setStep(2);

    const projectId = getId(project);
    if (!projectId) {
      setError('Selected project has no identifiable id');
      return;
    }

    setLoadingSites(true);
    setError(null);
    try {
      const res = await axios.get(`/api/projects/${encodeURIComponent(projectId)}/sites`);
      setSites(res.data.data || []);
    } catch (err) {
      console.error('selectProject error', err);
      setError(err.response?.data?.error || err.message || 'Failed to load sites for project');
    } finally {
      setLoadingSites(false);
    }
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
            <Header as="h4">Selected project: <strong>{selectedProject?.name || selectedProject?.id}</strong></Header>
            <p>Select a site linked to this project.</p>

            {loadingSites ? (
              <Loader active inline="centered">Loading sites...</Loader>
            ) : sites.length === 0 ? (
              <Message info content="No sites found for this project" />
            ) : (
              <Card.Group itemsPerRow={3}>
                {sites.map((s, idx) => (
                  <Card
                    key={getId(s) || `s-${idx}`}
                    onClick={() => setSelectedSite(s)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedSite(s); }}
                    aria-label={`Select site ${getName(s)}`}
                    color={getId(selectedSite) === getId(s) ? 'green' : undefined}
                  >
                    <Card.Content>
                      <Card.Header>{getName(s)}</Card.Header>
                      <Card.Meta>
                        ID:{' '}
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openSiteDetails(s, e);
                          }}
                          className="site-id-link"
                          style={{ 
                            textDecoration: 'underline', 
                            cursor: 'pointer',
                            fontWeight: '500',
                            color: onViewSiteDetail ? '#00ff88' : '#00ccff',
                            transition: 'color 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#00ff88';
                            e.currentTarget.style.textDecoration = 'underline';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = onViewSiteDetail ? '#00ff88' : '#00ccff';
                          }}
                          aria-label={`View details for site ${getId(s)}`}
                        >
                          {getId(s)}
                        </a>
                      </Card.Meta>
                    </Card.Content>
                  </Card>
                ))}
              </Card.Group>
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
          {siteToView && <SiteDetail site={siteToView} onBack={closeSiteDetails} />}
        </Modal.Content>
      </Modal>
    </div>
  );
}

export default ProjectDetail;
