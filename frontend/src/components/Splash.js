import React, { useState, useEffect } from 'react';
import { Button, Icon } from 'semantic-ui-react';
import axios from 'axios';
import './Splash.css';

export default function Splash({ onCreateProject, onViewProjects, onViewSites }) {
  const [stats, setStats] = useState({ projects: 0, sites: 0, loading: true });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [projectsRes, sitesRes] = await Promise.all([
          axios.get('/api/projects').catch(() => ({ data: { data: [] } })),
          axios.get('/api/sites').catch(() => ({ data: { data: [] } }))
        ]);
        setStats({
          projects: projectsRes.data?.data?.length || 0,
          sites: sitesRes.data?.data?.length || 0,
          loading: false
        });
      } catch (error) {
        setStats({ projects: 0, sites: 0, loading: false });
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="splash-page">
      {/* Hero Section */}
      <div className="splash-hero" role="img" aria-label="Research Data Hub hero">
        <div className="splash-hero-overlay">
          <div className="splash-hero-content">
            <div className="hero-badge">
              <Icon name="database" /> Research Data Hub
            </div>
            <h1 className="hero-title">Landmarks Preservation Commission</h1>
            <h2 className="hero-subtitle">Research Data Hub</h2>
            <p className="hero-description">
              Search, explore, and manage LPC's research dataset. 
              Create projects, link sites, and analyze landmark preservation data.
            </p>
            <div className="hero-stats">
              <div className="stat-item">
                <div className="stat-number">{stats.loading ? '...' : stats.projects}</div>
                <div className="stat-label">Projects</div>
              </div>
              <div className="stat-divider"></div>
              <div className="stat-item">
                <div className="stat-number">{stats.loading ? '...' : stats.sites}</div>
                <div className="stat-label">Sites</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions Section */}
      <div className="splash-actions">
        <div className="actions-header">
          <h2 className="actions-title">Get Started</h2>
          <p className="actions-subtitle">Choose an action to begin working with the Research Data Hub</p>
        </div>

        <div className="actions-grid">
          <div className="action-card primary" onClick={onCreateProject}>
            <div className="action-icon-wrapper">
              <Icon name="plus circle" className="action-icon" />
            </div>
            <h3 className="action-title">Create Project</h3>
            <p className="action-description">
              Add a new research project to the database. Define project details, 
              location, and metadata.
            </p>
            <Button primary className="action-button">
              Create Project <Icon name="arrow right" />
            </Button>
          </div>

          <div className="action-card" onClick={onViewProjects}>
            <div className="action-icon-wrapper">
              <Icon name="folder open" className="action-icon" />
            </div>
            <h3 className="action-title">View Projects</h3>
            <p className="action-description">
              Browse and manage existing research projects. Edit project details, 
              view associated sites, and manage project data.
            </p>
            <Button className="action-button">
              View Projects <Icon name="arrow right" />
            </Button>
          </div>

          <div className="action-card" onClick={onViewSites}>
            <div className="action-icon-wrapper">
              <Icon name="map marker alternate" className="action-icon" />
            </div>
            <h3 className="action-title">View Sites</h3>
            <p className="action-description">
              Explore all landmark sites in the database. View site details, 
              attributes, and geographic information.
            </p>
            <Button className="action-button">
              View Sites <Icon name="arrow right" />
            </Button>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="splash-features">
        <div className="features-grid">
          <div className="feature-item">
            <Icon name="search" className="feature-icon" />
            <h4>Search & Explore</h4>
            <p>Powerful query tools to search and filter research data</p>
          </div>
          <div className="feature-item">
            <Icon name="database" className="feature-icon" />
            <h4>Data Management</h4>
            <p>Manage projects, sites, and attributes with ease</p>
          </div>
          <div className="feature-item">
            <Icon name="map" className="feature-icon" />
            <h4>Geographic Data</h4>
            <p>View and manage spatial information for landmarks</p>
          </div>
          <div className="feature-item">
            <Icon name="chart bar" className="feature-icon" />
            <h4>Analytics</h4>
            <p>Analyze research data with custom queries and reports</p>
          </div>
        </div>
      </div>
    </div>
  );
}
