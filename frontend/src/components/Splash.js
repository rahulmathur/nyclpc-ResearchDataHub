import React from 'react';
import { Segment, Header, Grid, Button, Icon } from 'semantic-ui-react';
import './Splash.css';

export default function Splash({ onCreateProject, onViewProjects, onViewSites, onLogin, onSignup }) {
  const handleLogin = () => {
    if (onLogin) return onLogin();
    window.location.href = '/login';
  };
  const handleSignup = () => {
    if (onSignup) return onSignup();
    window.location.href = '/signup';
  };

  return (
    <div className="splash-page">
      <div className="splash-hero" role="img" aria-label="Research Data Hub hero">
        <div className="splash-hero-overlay">
          <div className="splash-hero-left">
            <Header as="h1" inverted>Welcome to the LPC Research Data Hub</Header>
            <p className="splash-sub inverted">Search, explore, and contribute to LPC's research dataset</p>
            <img src="/assets/research-hub-logo.png" alt="Research Data Hub" className="hero-logo" />
            <div className="hero-ctas">
              <Button basic inverted className="signup-btn" onClick={handleSignup}>Create account</Button>
              <Button primary className="login-btn" onClick={handleLogin}>Login</Button>
            </div>
          </div>
        </div>
      </div>

      <Segment padded>
        <p className="splash-sub">Quick actions to get you started</p>

        <Grid columns={3} stackable divided className="splash-grid">
          <Grid.Column textAlign="center">
            <Button primary size="large" onClick={onCreateProject} className="splash-btn" aria-label="Create a project">
              <Icon name="plus circle" /> Create a project
            </Button>
            <div className="splash-desc">Add a new project record to the `hub_projects` table</div>
          </Grid.Column>

          <Grid.Column textAlign="center">
            <Button basic size="large" onClick={onViewProjects} className="splash-btn" aria-label="View projects">
              <Icon name="list" /> View projects
            </Button>
            <div className="splash-desc">Browse existing projects and edit or delete them</div>
          </Grid.Column>

          <Grid.Column textAlign="center">
            <Button basic size="large" onClick={onViewSites} className="splash-btn" aria-label="View sites">
              <Icon name="map marker alternate" /> View sites
            </Button>
            <div className="splash-desc">Browse all sites in the `hub_sites` table</div>
          </Grid.Column>
        </Grid>

        <div className="splash-footer-text">Begin using LPC Research Data Hub</div>
      </Segment>
    </div>
  );
}
