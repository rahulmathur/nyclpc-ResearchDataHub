import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import { Button } from './components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
import TableView from './components/TableView';
import QueryEditor from './components/QueryEditor';
import ConnectionStatus from './components/ConnectionStatus';
import BrandHeader from './components/BrandHeader';
import Splash from './components/Splash';
import CreateProject from './components/CreateProject';
import ProjectsList from './components/ProjectsList';
import SitesList from './components/SitesList';
import SiteDetail from './components/SiteDetail';

function App() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [activeView, setActiveView] = useState('splash'); // 'splash', 'tables', 'query', 'projects', 'sites', 'site-detail'
  const [isLoading, setIsLoading] = useState(true);
  // Table navigation helpers
  const [addFormTrigger, setAddFormTrigger] = useState(0); // increment to trigger add form in TableView
  // Projects editing state
  const [editingProject, setEditingProject] = useState(null);
  // Sites detail state
  const [selectedSite, setSelectedSite] = useState(null);

  useEffect(() => {
    checkConnection();
    loadTables();
  }, []);

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
  const viewTable = (tableName, openAdd = false) => {
    setSelectedTable(tableName);
    setActiveView('tables');
    if (openAdd) setAddFormTrigger((t) => t + 1);
  };

  const createProject = () => { setEditingProject(null); setActiveView('create-project'); };
  const viewProjects = () => setActiveView('projects');
  const viewSites = () => { setSelectedSite(null); setActiveView('sites'); };
  const viewSiteDetail = (site) => { setSelectedSite(site); setActiveView('site-detail'); };
  const backToSites = () => { setSelectedSite(null); setActiveView('sites'); };

  const editProject = (project) => { setEditingProject(project); setActiveView('create-project'); };


  return (
    <div className="app">
      <header className="app-header bg-slate-900 text-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-8">
            {/* BrandHeader component is used for logo */}
            <BrandHeader />

            <nav className="flex items-center gap-4">
              <Button
                variant={activeView === 'splash' ? 'default' : 'ghost'}
                onClick={() => setActiveView('splash')}
                className="text-white hover:bg-slate-800"
              >
                <span className="mr-2">🏠</span> Home
              </Button>
              <Button
                variant={activeView === 'projects' ? 'default' : 'ghost'}
                onClick={() => viewProjects()}
                className="text-white hover:bg-slate-800"
              >
                <span className="mr-2">📁</span> Projects
              </Button>
              <Button
                variant={activeView === 'sites' || activeView === 'site-detail' ? 'default' : 'ghost'}
                onClick={() => viewSites()}
                className="text-white hover:bg-slate-800"
              >
                <span className="mr-2">📍</span> Sites
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="text-white hover:bg-slate-800">
                    Utilities
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onClick={() => setActiveView('tables')}
                    className={activeView === 'tables' ? 'bg-slate-100' : ''}
                  >
                    <span className="mr-2">📊</span> Tables
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setActiveView('query')}
                    className={activeView === 'query' ? 'bg-slate-100' : ''}
                  >
                    <span className="mr-2">⚡</span> Query
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <ConnectionStatus status={connectionStatus} />
          </div>
        </div>
      </header> 

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
                <TableView tableName={selectedTable} openAddTrigger={addFormTrigger} />
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
          <SiteDetail site={selectedSite} onBack={backToSites} />
        ) : activeView === 'create-project' ? (
          <CreateProject project={editingProject} onCreated={() => { setActiveView('projects'); setEditingProject(null); loadTables(); }} onCancel={() => { setActiveView('projects'); setEditingProject(null); }} />
        ) : null}
      </div>

      <footer className="site-footer bg-slate-100 border-t">
        <div className="max-w-7xl mx-auto px-4 py-4 text-sm text-slate-700">
          © City of New York. Landmarks Preservation Commission · <a href="https://www.nyc.gov/site/lpc/index.page" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">nyc.gov/site/lpc</a>
        </div>
      </footer>
    </div>
  );
}

export default App;
