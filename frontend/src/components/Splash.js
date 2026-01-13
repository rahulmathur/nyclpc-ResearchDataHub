import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
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
            <h1 className="text-4xl font-bold text-white mb-4">Welcome to the LPC Research Data Hub</h1>
            <p className="splash-sub inverted">Search, explore, and contribute to LPC's research dataset</p>
            <img src="/assets/research-hub-logo.png" alt="Research Data Hub" className="hero-logo" />
            <div className="hero-ctas gap-3 mt-6">
              <Button variant="outline" className="text-white border-white hover:bg-white hover:text-slate-950" onClick={handleSignup}>
                Create account
              </Button>
              <Button onClick={handleLogin}>Login</Button>
            </div>
          </div>
        </div>
      </div>

      <Card className="m-6">
        <CardContent>
          <p className="splash-sub mb-6">Quick actions to get you started</p>

          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <Button size="lg" onClick={onCreateProject} className="splash-btn w-full mb-3">
                ➕ Create a project
              </Button>
              <div className="splash-desc text-sm text-slate-600">Add a new project record to the `hub_projects` table</div>
            </div>

            <div className="text-center">
              <Button variant="outline" size="lg" onClick={onViewProjects} className="splash-btn w-full mb-3">
                📋 View projects
              </Button>
              <div className="splash-desc text-sm text-slate-600">Browse existing projects and edit or delete them</div>
            </div>

            <div className="text-center">
              <Button variant="outline" size="lg" onClick={onViewSites} className="splash-btn w-full mb-3">
                📍 View sites
              </Button>
              <div className="splash-desc text-sm text-slate-600">Browse all sites in the `hub_sites` table</div>
            </div>
          </div>

          <div className="splash-footer-text text-center mt-8 text-slate-600 font-medium">Begin using LPC Research Data Hub</div>
        </CardContent>
      </Card>
    </div>
  );
}
