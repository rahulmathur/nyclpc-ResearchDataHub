import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import { Menu, Container, Dropdown, Icon, Sidebar, SidebarPushable, SidebarPusher } from 'semantic-ui-react';
import TableView from './components/TableView';
import QueryEditor from './components/QueryEditor';
import ConnectionStatus from './components/ConnectionStatus';
import BrandHeader from './components/BrandHeader';
import PreLoginSplash from './components/PreLoginSplash';
import Splash from './components/Splash';
import CreateProject from './components/CreateProject';
import ProjectsList from './components/ProjectsList';
import SitesList from './components/SitesList';
import SiteDetail from './components/SiteDetail';

const AUTH_STORAGE_KEY = 'lpc_rdh_authenticated';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem(AUTH_STORAGE_KEY) === 'true');
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [activeView, setActiveView] = useState('splash'); // 'splash', 'tables', 'query', 'projects', 'sites', 'site-detail'
  const [isLoading, setIsLoading] = useState(true);
  // Projects editing state
  const [editingProject, setEditingProject] = useState(null);
  // Sites detail state
  const [selectedSite, setSelectedSite] = useState(null);
  // Mobile menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Track previous view for navigation
  const [previousView, setPreviousView] = useState(null);

  useEffect(() => {
    if (isLoggedIn) {
      checkConnection();
      loadTables();
    }
  }, [isLoggedIn]);

  const checkConnection = async () => {
    try {
      const response = await axios.get('/api/health');
      setConnectionStatus(response.data);
    } catch (error) {
      setConnectionStatus({ status: 'error', database: 'disconnected' });
    }
  };

  const loadTables = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get('/api/tables');
      setTables(response.data.tables || []);
    } catch (error) {
      console.error('Failed to load tables:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Navigation helpers for Splash actions

  const createProject = () => { setEditingProject(null); setActiveView('create-project'); };
  const viewProjects = () => setActiveView('projects');
  const viewSites = () => { setSelectedSite(null); setActiveView('sites'); };
  const viewSiteDetail = (site, fromView = null) => { 
    setPreviousView(fromView || activeView);
    setSelectedSite(site); 
    setActiveView('site-detail'); 
  };
  const backFromSiteDetail = () => {
    if (previousView) {
      setActiveView(previousView);
      setPreviousView(null);
    } else {
      setSelectedSite(null);
      setActiveView('sites');
    }
  };

  const editProject = (project) => { setEditingProject(project); setActiveView('create-project'); };

  const handleNavClick = (view) => {
    setActiveView(view);
    setMobileMenuOpen(false);
  };

  const handleLoginSuccess = () => setIsLoggedIn(true);

  const handleLogout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return (
      <div className="app">
        <PreLoginSplash onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  return (
    <div className="app">
      <Menu inverted className="app-header" fixed="top">
        <Container fluid className="nav-container">
          {/* BrandHeader component is used for logo */}
          <BrandHeader />

          {/* Desktop Navigation */}
          <Menu.Menu position="left" className="desktop-nav">
            <Menu.Item 
              name="home" 
              active={activeView === 'splash'} 
              onClick={() => handleNavClick('splash')}
              className="nav-item"
            >
              <Icon name="home" />
              <span className="nav-text">Home</span>
            </Menu.Item>
            <Menu.Item 
              name="projects" 
              active={activeView === 'projects'} 
              onClick={() => { handleNavClick('projects'); viewProjects(); }}
              className="nav-item"
            >
              <Icon name="folder" />
              <span className="nav-text">Projects</span>
            </Menu.Item>
            <Menu.Item 
              name="sites" 
              active={activeView === 'sites' || activeView === 'site-detail'} 
              onClick={() => { handleNavClick('sites'); viewSites(); }}
              className="nav-item"
            >
              <Icon name="map marker alternate" />
              <span className="nav-text">Sites</span>
            </Menu.Item>
            <Dropdown 
              item 
              text="Utilities" 
              className="nav-item utilities-dropdown"
              icon="wrench"
              pointing="left"
            >
              <Dropdown.Menu>
                <Dropdown.Item 
                  active={activeView === 'tables'} 
                  onClick={() => handleNavClick('tables')}
                >
                  <Icon name="table" />
                  <span>Tables</span>
                </Dropdown.Item>
                <Dropdown.Item 
                  active={activeView === 'query'} 
                  onClick={() => handleNavClick('query')}
                >
                  <Icon name="code" />
                  <span>Query Editor</span>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </Menu.Menu>

          <Menu.Menu position="right" className="desktop-nav">
            <Menu.Item onClick={handleLogout} className="nav-item">
              <Icon name="sign out" />
              <span className="nav-text">Log out</span>
            </Menu.Item>
            <Menu.Item className="connection-status-item">
              <ConnectionStatus status={connectionStatus} />
            </Menu.Item>
          </Menu.Menu>

          {/* Mobile Menu Toggle */}
          <Menu.Menu position="right" className="mobile-nav-toggle">
            <Menu.Item onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              <Icon name={mobileMenuOpen ? 'close' : 'sidebar'} size="large" />
            </Menu.Item>
          </Menu.Menu>
        </Container>
      </Menu>

      {/* Mobile Sidebar Menu */}
      <SidebarPushable as="div">
        {mobileMenuOpen && (
          <div className="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)} />
        )}
        <Sidebar
          as={Menu}
          animation="overlay"
          icon="labeled"
          inverted
          onHide={() => setMobileMenuOpen(false)}
          vertical
          visible={mobileMenuOpen}
          width="thin"
          className="mobile-sidebar"
        >
          <Menu.Item 
            name="home" 
            active={activeView === 'splash'} 
            onClick={() => handleNavClick('splash')}
          >
            <Icon name="home" />
            Home
          </Menu.Item>
          <Menu.Item 
            name="projects" 
            active={activeView === 'projects'} 
            onClick={() => { handleNavClick('projects'); viewProjects(); }}
          >
            <Icon name="folder" />
            Projects
          </Menu.Item>
          <Menu.Item 
            name="sites" 
            active={activeView === 'sites' || activeView === 'site-detail'} 
            onClick={() => { handleNavClick('sites'); viewSites(); }}
          >
            <Icon name="map marker alternate" />
            Sites
          </Menu.Item>
          <Menu.Item 
            name="tables" 
            active={activeView === 'tables'} 
            onClick={() => handleNavClick('tables')}
          >
            <Icon name="table" />
            Tables
          </Menu.Item>
          <Menu.Item 
            name="query" 
            active={activeView === 'query'} 
            onClick={() => handleNavClick('query')}
          >
            <Icon name="code" />
            Query Editor
          </Menu.Item>
          <Menu.Item className="mobile-connection-status">
            <ConnectionStatus status={connectionStatus} />
          </Menu.Item>
          <Menu.Item onClick={handleLogout}>
            <Icon name="sign out" />
            Log out
          </Menu.Item>
        </Sidebar>

        <SidebarPusher dimmed={mobileMenuOpen}>
          <div className="app-body">
        {activeView === 'splash' ? (
          <Splash onCreateProject={createProject} onViewProjects={viewProjects} onViewSites={viewSites} />
        ) : activeView === 'tables' ? (
          <div className="tables-view">
            <aside className="sidebar">
              <div className="sidebar-header">
                <h2>Tables</h2>
                <button className="refresh-btn" onClick={loadTables} title="Refresh">
                  ↻
                </button>
              </div>
              {isLoading ? (
                <div className="loading">Loading...</div>
              ) : tables.length === 0 ? (
                <div className="empty-state">
                  <p>No tables found</p>
                </div>
              ) : (
                <ul className="tables-list">
                  {tables.map((table) => (
                    <li 
                      key={table} 
                      className={selectedTable === table ? 'active' : ''}
                      onClick={() => setSelectedTable(table)}
                    >
                      <span className="table-icon">▸</span>
                      {table}
                    </li>
                  ))}
                </ul>
              )}
            </aside>
            <main className="main-content">
              {selectedTable ? (
                <TableView tableName={selectedTable} />
              ) : (
                <div className="welcome-screen">
                  <div className="welcome-content">
                    <h2>Select a table to get started</h2>
                    <p>Choose a table from the sidebar to view and manage its data</p>
                  </div>
                </div>
              )}
            </main>
          </div>
        ) : activeView === 'query' ? (
          <QueryEditor />
        ) : activeView === 'projects' ? (
          <ProjectsList onEdit={editProject} onCreate={() => createProject()} onChange={loadTables} />
        ) : activeView === 'sites' ? (
          <SitesList onEdit={viewSiteDetail} onChange={loadTables} />
        ) : activeView === 'site-detail' && selectedSite ? (
          <SiteDetail 
            site={selectedSite} 
            onBack={backFromSiteDetail}
            backLabel={previousView === 'create-project' ? '← Back to Project' : previousView === 'projects' ? '← Back to Projects' : '← Back to Sites'}
          />
        ) : activeView === 'create-project' ? (
          <CreateProject 
            project={editingProject} 
            onCreated={() => { setActiveView('projects'); setEditingProject(null); loadTables(); }} 
            onCancel={() => { setActiveView('projects'); setEditingProject(null); }}
            onViewSiteDetail={viewSiteDetail}
          />
        ) : null}
          </div>

          <footer className="site-footer">
            <Container>
              <div>© City of New York. Landmarks Preservation Commission · <a href="https://www.nyc.gov/site/lpc/index.page" target="_blank" rel="noopener noreferrer">nyc.gov/site/lpc</a></div>
            </Container>
          </footer>
        </SidebarPusher>
      </SidebarPushable>
    </div>
  );
}

export default App;
