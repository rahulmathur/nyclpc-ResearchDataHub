import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, Button, Table, Icon, Message, Input, Confirm } from 'semantic-ui-react';
import axios from 'axios';
import './ProjectFiles.css';

export default function ProjectFiles({ open, onClose, projectId }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
  const fileInputRef = useRef(null);

  const loadFiles = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/api/projects/${projectId}/files`);
      setFiles(response.data?.data || []);
    } catch (err) {
      console.error('Failed to load files:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Load files when modal opens
  useEffect(() => {
    if (open && projectId) {
      loadFiles();
    }
  }, [open, projectId, loadFiles]);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      await axios.post(`/api/projects/${projectId}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setSuccess(`File "${file.name}" uploaded successfully`);
      await loadFiles();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Failed to upload file:', err);
      setError(err.response?.data?.error || err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      setError('Folder name is required');
      return;
    }

    setCreatingFolder(true);
    setError(null);
    setSuccess(null);

    try {
      await axios.post(`/api/projects/${projectId}/folders`, {
        folderName: newFolderName.trim(),
      });

      setSuccess(`Folder "${newFolderName}" created successfully`);
      setNewFolderName('');
      setCreateFolderOpen(false);
      await loadFiles();
    } catch (err) {
      console.error('Failed to create folder:', err);
      if (err.response?.status === 409) {
        setError('A folder with this name already exists');
      } else {
        setError(err.response?.data?.error || err.message || 'Failed to create folder');
      }
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleDeleteClick = (file) => {
    setFileToDelete(file);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!fileToDelete) return;

    try {
      const qs = fileToDelete.type === 'folder' ? '?type=folder' : '';
      await axios.delete(`/api/projects/${projectId}/files/${fileToDelete.id}${qs}`);
      setSuccess(`${fileToDelete.type === 'folder' ? 'Folder' : 'File'} "${fileToDelete.name}" deleted successfully`);
      await loadFiles();
    } catch (err) {
      console.error('Failed to delete:', err);
      setError(err.response?.data?.error || err.message || 'Failed to delete');
    } finally {
      setDeleteConfirmOpen(false);
      setFileToDelete(null);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const getFileIcon = (file) => {
    if (file.type === 'folder') {
      return 'folder';
    }
    // Simple icon based on extension
    const ext = file.extension?.toLowerCase();
    if (['pdf'].includes(ext)) return 'file pdf';
    if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) return 'file image';
    if (['doc', 'docx'].includes(ext)) return 'file word';
    if (['xls', 'xlsx'].includes(ext)) return 'file excel';
    if (['zip', 'rar', '7z'].includes(ext)) return 'file archive';
    return 'file';
  };

  return (
    <>
      <Modal open={open} onClose={onClose} size="large" className="project-files-modal">
        <Modal.Header>
          <Icon name="cloud" /> Project Files
          <Button
            icon
            floated="right"
            size="small"
            onClick={loadFiles}
            loading={loading}
            title="Refresh"
          >
            <Icon name="refresh" />
          </Button>
        </Modal.Header>
        <Modal.Content>
          {error && (
            <Message negative onDismiss={() => setError(null)}>
              {error}
            </Message>
          )}
          {success && (
            <Message positive onDismiss={() => setSuccess(null)}>
              {success}
            </Message>
          )}

          <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
            <Button
              primary
              icon
              labelPosition="left"
              onClick={() => fileInputRef.current?.click()}
              loading={uploading}
              disabled={uploading}
            >
              <Icon name="upload" />
              Upload File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
            <Button
              icon
              labelPosition="left"
              onClick={() => setCreateFolderOpen(true)}
            >
              <Icon name="folder plus" />
              Create Folder
            </Button>
          </div>

          {createFolderOpen && (
            <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-secondary, #f5f5f5)', borderRadius: 4 }}>
              <Input
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                }}
                action
              >
                <input />
                <Button
                  positive
                  onClick={handleCreateFolder}
                  loading={creatingFolder}
                  disabled={creatingFolder || !newFolderName.trim()}
                >
                  Create
                </Button>
                <Button onClick={() => { setCreateFolderOpen(false); setNewFolderName(''); }}>
                  Cancel
                </Button>
              </Input>
            </div>
          )}

          {loading && files.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Icon name="spinner" loading size="big" />
              <p>Loading files...</p>
            </div>
          ) : files.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim, #888)' }}>
              <Icon name="folder open outline" size="big" />
              <p>No files or folders yet. Upload a file or create a folder to get started.</p>
            </div>
          ) : (
            <Table celled>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Name</Table.HeaderCell>
                  <Table.HeaderCell>Type</Table.HeaderCell>
                  <Table.HeaderCell>Size</Table.HeaderCell>
                  <Table.HeaderCell>Modified</Table.HeaderCell>
                  <Table.HeaderCell>Actions</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {files.map((file) => (
                  <Table.Row key={file.id}>
                    <Table.Cell>
                      <Icon name={getFileIcon(file)} />
                      {file.name}
                    </Table.Cell>
                    <Table.Cell>{file.type === 'folder' ? 'Folder' : 'File'}</Table.Cell>
                    <Table.Cell>{formatFileSize(file.size)}</Table.Cell>
                    <Table.Cell>{formatDate(file.modifiedAt)}</Table.Cell>
                    <Table.Cell>
                      <Button
                        icon
                        size="small"
                        color="red"
                        onClick={() => handleDeleteClick(file)}
                        title="Delete"
                      >
                        <Icon name="trash" />
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={onClose}>Close</Button>
        </Modal.Actions>
      </Modal>

      <Confirm
        open={deleteConfirmOpen}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setFileToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        content={`Are you sure you want to delete "${fileToDelete?.name}"? This action cannot be undone.`}
        confirmButton="Delete"
        cancelButton="Cancel"
      />
    </>
  );
}
