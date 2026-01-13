import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import './Wizard.css';

function Wizard() {
  const [step, setStep] = useState(1);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingSites, setLoadingSites] = useState(false);
  const [error, setError] = useState(null);
  const [lastProjectsRaw, setLastProjectsRaw] = useState(null);

  const projectsRef = useRef(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    // when step 1 is active and projects are loaded, focus the first project item for keyboard users
    if (step === 1 && projectsRef.current) {
      const firstButton = projectsRef.current.querySelector('button');
      if (firstButton && typeof firstButton.focus === 'function') firstButton.focus();
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
    // Placeholder: Do something with the selected project/site
    alert(`Selected project: ${getName(selectedProject)} (${getId(selectedProject)})\nSelected site: ${getName(selectedSite)} (${getId(selectedSite)})`);
  };

  return (
    <div className="wizard">
      <Card>
        <CardHeader className="flex justify-between items-center">
          <CardTitle>Project → Site Wizard</CardTitle>
          <div className="text-sm text-slate-600">Step {step} of 2</div>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 1 && (
            <div className="wizard-step">
              <h3 className="text-lg font-semibold mb-4">Select a project from the list below</h3>

              {loadingProjects ? (
                <div className="text-center text-slate-500 py-4">Loading projects...</div>
              ) : projects.length === 0 ? (
                <div className="empty">
                  <Alert>
                    <AlertTitle>No projects found</AlertTitle>
                    <AlertDescription>If you expect projects to exist, confirm the backend `/api/projects` response.</AlertDescription>
                  </Alert>
                  {lastProjectsRaw && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer' }}>Show raw API response</summary>
                      <pre style={{ maxHeight: 200, overflow: 'auto', background: '#f5f5f5', padding: 8, borderRadius: 6, fontSize: '0.85rem' }}>{JSON.stringify(lastProjectsRaw, null, 2)}</pre>
                    </details>
                  )}
                </div>
              ) : (
                <div ref={projectsRef} className="project-list-container space-y-2" aria-label="Project list">
                  {projects.map((p, idx) => (
                    <Button
                      key={getId(p) || `p-${idx}`}
                      onClick={() => selectProject(p)}
                      variant="outline"
                      className="w-full justify-start text-left h-auto py-3"
                      aria-label={`Select project ${getName(p)}`}
                    >
                      <div>
                        <div className="font-medium">{getName(p)}</div>
                        <div className="text-sm text-slate-500">ID: {getId(p)}</div>
                      </div>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="wizard-step">
              <h3 className="text-lg font-semibold mb-2">
                Selected project: <strong>{selectedProject?.name || selectedProject?.id}</strong>
              </h3>
              <p className="text-slate-600 mb-6">Select a site linked to this project.</p>

              {loadingSites ? (
                <div className="text-center text-slate-500 py-4">Loading sites...</div>
              ) : sites.length === 0 ? (
                <Alert>
                  <AlertDescription>No sites found for this project</AlertDescription>
                </Alert>
              ) : (
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {sites.map((s, idx) => (
                    <Card
                      key={getId(s) || `s-${idx}`}
                      onClick={() => setSelectedSite(s)}
                      className={`cursor-pointer transition-colors ${
                        getId(selectedSite) === getId(s)
                          ? 'border-green-500 bg-green-50'
                          : 'hover:border-slate-400'
                      }`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedSite(s); }}
                      aria-label={`Select site ${getName(s)}`}
                    >
                      <CardContent className="pt-4">
                        <div className="font-medium">{getName(s)}</div>
                        <div className="text-sm text-slate-500">ID: {getId(s)}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <div className="flex gap-2 justify-between mt-6">
                <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
                <Button onClick={confirm} disabled={!selectedSite}>Confirm</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Wizard;
