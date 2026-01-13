import React, { useState } from 'react';
import axios from 'axios';
import { Form, Button } from 'semantic-ui-react';
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
      <div className="editor-header">
        <h2>Query Editor</h2>
        <span className="editor-hint">Press Ctrl+Enter to execute</span>
      </div>

      <div className="editor-container">
        <Form>
          <Form.TextArea
            aria-label="SQL query editor"
            className="query-input"
            value={query}
            onChange={(e, { value }) => setQuery(value)}
            onKeyDown={handleKeyPress}
            placeholder={`Enter your SQL query here...\n\nExample:\nSELECT * FROM users WHERE active = true LIMIT 10;`}
            rows={8}
          />
          <Button primary aria-label="Execute SQL query" onClick={executeQuery} loading={loading} disabled={loading}>
            ⚡ Execute Query
          </Button>
        </Form>
      </div>

      {error && (
        <div className="error-message">
          <div className="error-icon">⚠</div>
          <div className="error-content">
            <strong>Error:</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {result && (
        <div className="query-results">
          <div className="results-header">
            <h3>Results</h3>
            <span className="results-count">
              {result.rowCount || result.data?.length || 0} rows
            </span>
          </div>

          {result.data && result.data.length > 0 ? (
            <div className="results-table-container">
              <table className="results-table">
                <thead>
                  <tr>
                    {Object.keys(result.data[0]).map(column => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((row, index) => (
                    <tr key={index}>
                      {Object.values(row).map((value, i) => (
                        <td key={i}>{String(value)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-results">
              <p>Query executed successfully. No rows returned.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default QueryEditor;
