import React, { useState } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import './QueryEditor.css';

function QueryEditor() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const executeQuery = async () => {
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await axios.post('/api/query', { query });
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      executeQuery();
    }
  };

  return (
    <div className="query-editor">
      <div className="editor-header mb-4">
        <h2 className="text-2xl font-bold">Query Editor</h2>
        <span className="text-sm text-slate-500">Press Ctrl+Enter to execute</span>
      </div>

      <div className="editor-container bg-white rounded-lg border border-slate-200 p-4 mb-4">
        <Textarea
          aria-label="SQL query editor"
          className="query-input font-mono text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder={`Enter your SQL query here...\n\nExample:\nSELECT * FROM users WHERE active = true LIMIT 10;`}
          rows={8}
        />
        <div className="mt-4">
          <Button onClick={executeQuery} disabled={loading}>
            ⚡ Execute Query
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <div className="query-results bg-white rounded-lg border border-slate-200 p-4">
          <div className="results-header flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Results</h3>
            <span className="text-sm text-slate-600">
              {result.rowCount || result.data?.length || 0} rows
            </span>
          </div>

          {result.data && result.data.length > 0 ? (
            <div className="results-table-container overflow-auto">
              <table className="results-table w-full text-sm border-collapse">
                <thead className="bg-slate-100">
                  <tr>
                    {Object.keys(result.data[0]).map(column => (
                      <th key={column} className="border border-slate-200 px-3 py-2 text-left font-medium">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((row, index) => (
                    <tr key={index} className="hover:bg-slate-50">
                      {Object.values(row).map((value, i) => (
                        <td key={i} className="border border-slate-200 px-3 py-2">{String(value)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-results text-slate-600 py-8 text-center">
              <p>Query executed successfully. No rows returned.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default QueryEditor;
