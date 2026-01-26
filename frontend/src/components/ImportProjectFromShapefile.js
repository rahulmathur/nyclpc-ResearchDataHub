import React, { useState, useRef } from 'react';
import { Segment, Header, Form, Button, Message, Icon, Progress, Table } from 'semantic-ui-react';
import axios from 'axios';
import './ImportProjectFromShapefile.css';

export default function ImportProjectFromShapefile({ onImported, onCancel }) {
  const [shapefile, setShapefile] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const validateAndSetFile = (file) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Please upload a .zip file containing shapefile components (.shp, .shx, .dbf)');
      setShapefile(null);
      return;
    }
    setShapefile(file);
    setError(null);
    setSuccess(null);
    setImportResult(null);
  };

  const clearShapefile = () => {
    setShapefile(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!shapefile) {
      setError('Please select a shapefile to upload');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('shapefile', shapefile);
      if (projectName.trim()) {
        formData.append('projectName', projectName.trim());
      }

      const response = await axios.post('/api/projects/import-shapefile', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000 // 5 minutes for large files
      });

      const result = response.data?.data;
      setImportResult(result);
      setSuccess(`Import successful! Created project "${result.projectName}" with ${result.sitesCreated} sites and ${result.attributesUsed} attributes.`);

      // Clear form
      setShapefile(null);
      setProjectName('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (onImported) {
        onImported(result);
      }
    } catch (err) {
      console.error('Import error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to import shapefile');
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="import-project-shapefile">
      <Segment>
        <Header as="h2">
          <Icon name="upload" />
          Import Project from Shapefile
        </Header>
        <p className="description">
          Upload a shapefile (.zip) to create a new project. Each feature in the shapefile will become a site, 
          and all fields will be stored as site attributes.
        </p>

        {error && <Message negative icon="warning sign" content={error} />}
        {success && <Message positive icon="check circle" content={success} />}

        <Form>
          {/* Dropzone */}
          <Form.Field>
            <label>Shapefile (ZIP)</label>
            <div
              className={`dropzone ${dragActive ? 'active' : ''} ${shapefile ? 'has-file' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              
              {shapefile ? (
                <div className="file-info">
                  <Icon name="file archive" size="big" />
                  <div className="file-details">
                    <div className="file-name">{shapefile.name}</div>
                    <div className="file-size">{formatFileSize(shapefile.size)}</div>
                  </div>
                  <Button
                    icon="close"
                    size="small"
                    circular
                    onClick={(e) => {
                      e.stopPropagation();
                      clearShapefile();
                    }}
                    title="Remove file"
                  />
                </div>
              ) : (
                <div className="dropzone-content">
                  <Icon name="cloud upload" size="huge" />
                  <p>Drag and drop a .zip file here, or click to browse</p>
                  <p className="hint">The ZIP should contain .shp, .shx, and .dbf files</p>
                </div>
              )}
            </div>
          </Form.Field>

          {/* Project Name (optional) */}
          <Form.Input
            label="Project Name (optional)"
            placeholder="Leave blank for auto-generated name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            disabled={loading}
          />

          {/* Progress indicator */}
          {loading && (
            <div className="import-progress">
              <Progress percent={100} active indicating>
                Importing shapefile... This may take a while for large files.
              </Progress>
            </div>
          )}

          {/* Import Result Details */}
          {importResult && (
            <Segment className="import-result">
              <Header as="h4">Import Summary</Header>
              <Table definition compact>
                <Table.Body>
                  <Table.Row>
                    <Table.Cell width={6}>Project ID</Table.Cell>
                    <Table.Cell>{importResult.projectId}</Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell>Project Name</Table.Cell>
                    <Table.Cell>{importResult.projectName}</Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell>Sites Created</Table.Cell>
                    <Table.Cell>{importResult.sitesCreated}</Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell>Sites Skipped</Table.Cell>
                    <Table.Cell>{importResult.sitesSkipped}</Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell>Attributes Used</Table.Cell>
                    <Table.Cell>{importResult.attributesUsed}</Table.Cell>
                  </Table.Row>
                  {importResult.attributeNames && importResult.attributeNames.length > 0 && (
                    <Table.Row>
                      <Table.Cell>Attribute Names</Table.Cell>
                      <Table.Cell>
                        <div className="attribute-tags">
                          {importResult.attributeNames.map((name, i) => (
                            <span key={i} className="attribute-tag">{name}</span>
                          ))}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table>
            </Segment>
          )}

          {/* Action Buttons */}
          <div className="actions">
            <Button
              primary
              onClick={handleSubmit}
              loading={loading}
              disabled={loading || !shapefile}
            >
              <Icon name="upload" />
              Import Shapefile
            </Button>
            <Button
              onClick={() => {
                if (onCancel) onCancel();
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            {importResult && (
              <Button
                color="green"
                onClick={() => {
                  if (onImported) onImported(importResult);
                }}
              >
                <Icon name="eye" />
                View Project
              </Button>
            )}
          </div>
        </Form>
      </Segment>
    </div>
  );
}
