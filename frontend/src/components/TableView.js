import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from './ui/table';
import './TableView.css';

function TableView({ tableName, openAddTrigger }) {
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [columnMeta, setColumnMeta] = useState([]); // metadata including enum values
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ limit: 50, offset: 0, count: 0 });
  const [pageSize, setPageSize] = useState(50);
  const [useEstimatedCount, setUseEstimatedCount] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRow, setEditingRow] = useState(null);
  const [editData, setEditData] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  
  useEffect(() => {
    if (typeof openAddTrigger !== 'undefined' && openAddTrigger !== null) {
      setShowAddForm(true);
    }
  }, [openAddTrigger]);
  
  const [newRecord, setNewRecord] = useState({});
  
  useEffect(() => {
    setShowAddForm(false);
    setNewRecord({});
  }, [tableName]);

  useEffect(() => {
    loadTableData();
    (async () => {
      try {
        const colRes = await axios.get(`/api/columns/${tableName}`);
        setColumnMeta(colRes.data.columns || []);
      } catch (e) {
        setColumnMeta([]);
      }
    })();
  }, [tableName, pagination.offset, pageSize, useEstimatedCount]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPagination(prev => ({ ...prev, offset: 0 }));
      loadTableData();
    }, 350);
    return () => clearTimeout(t);
  }, [searchQuery, tableName, pageSize, useEstimatedCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTableData = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/table/${tableName}`, {
        params: { limit: pageSize, offset: pagination.offset, q: searchQuery || undefined, fastCount: useEstimatedCount ? 'true' : undefined }
      });
      
      const rawData = response.data.data || [];
      const tableData = rawData.map((r, idx) => {
        const dbId = r.id || r._id || r.hub_project_id || r.hub_site_id;
        return { ...r, __internalId: dbId ?? `row-${pagination.offset + idx}` };
      });
      setData(tableData);
      setPagination(prev => ({ ...prev, count: response.data.count }));
      
      if (tableData.length > 0) {
        setColumns(Object.keys(tableData[0]).filter(c => c !== '__internalId'));
      }
    } catch (error) {
      console.error('Failed to load table data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (row) => {
    setEditingRow(row.__internalId);
    const { __internalId, ...rest } = row;
    setEditData({ ...rest });
  };

  const handleSave = async (internalId) => {
    try {
      const row = data.find(r => r.__internalId === internalId);
      if (!row) throw new Error('Row not found');
      const dbId = row.id || row._id || row.hub_project_id || row.hub_site_id || internalId;
      await axios.put(`/api/table/${tableName}/${dbId}`, editData);
      setEditingRow(null);
      setEditData({});
      loadTableData();
    } catch (error) {
      console.error('Failed to update:', error);
      alert('Failed to update record');
    }
  };

  const handleDelete = async (internalId) => {
    if (!window.confirm('Are you sure you want to delete this record?')) return;
    
    try {
      const row = data.find(r => r.__internalId === internalId);
      if (!row) throw new Error('Row not found');
      const dbId = row.id || row._id || row.hub_project_id || row.hub_site_id || internalId;
      await axios.delete(`/api/table/${tableName}/${dbId}`);
      loadTableData();
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('Failed to delete record');
    }
  };

  const handleAdd = async () => {
    try {
      await axios.post(`/api/table/${tableName}`, newRecord);
      setShowAddForm(false);
      setNewRecord({});
      loadTableData();
    } catch (error) {
      console.error('Failed to add record:', error);
      alert('Failed to add record');
    }
  };

  const nextPage = () => {
    if (pagination.offset + pagination.limit < pagination.count) {
      setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }));
    }
  };

  const prevPage = () => {
    if (pagination.offset > 0) {
      setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));
    }
  };

  if (loading && data.length === 0) {
    return (
      <div className="table-loading flex justify-center items-center p-8">
        <div className="text-slate-600">Loading data...</div>
      </div>
    );
  }

  return (
    <div className="table-view">
      <div className="table-header p-4 border-b">
        <h2 className="text-2xl font-bold mb-4">{tableName}</h2>
        <div className="table-actions flex flex-col gap-4">
          <span className="record-count text-sm text-slate-600">{pagination.count}{' '}{pagination.count ? (pagination.count_estimated ? ' (approx)' : '') : ''} records</span>

          <div className="flex gap-3 flex-wrap items-center">
            <Input
              placeholder="Search (across text columns)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-48"
              aria-label="table-search"
            />

            <select value={pageSize} onChange={(e) => setPageSize(parseInt(e.target.value, 10))} className="h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" aria-label="page-size-select">
              {[25,50,100,250,500,1000].map(s => <option key={s} value={s}>{s}/page</option>)}
            </select>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={useEstimatedCount} onChange={(e) => setUseEstimatedCount(e.target.checked)} className="h-4 w-4" />
              <span>Use estimated count</span>
            </label>

            <Button onClick={() => setShowAddForm(!showAddForm)}>+ Add Record</Button>
          </div>
        </div>
      </div>

      {showAddForm && (
        <div className="add-form p-4 border-b bg-slate-50">
          <h3 className="font-semibold mb-4">Add New Record</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {columns.filter(col => col !== 'id' && col !== '_id').map(column => {
              const meta = columnMeta.find(m => m.column_name === column);
              if (meta?.enum_values?.length) {
                return (
                  <div key={column}>
                    <label className="text-sm font-medium block mb-1">{column}</label>
                    <select 
                      value={newRecord[column] || ''}
                      onChange={(e) => setNewRecord({ ...newRecord, [column]: e.target.value })}
                      className="h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm w-full"
                    >
                      <option value="">Select {column}</option>
                      {meta.enum_values.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                );
              }

              return (
                <div key={column}>
                  <label className="text-sm font-medium block mb-1">{column}</label>
                  <Input
                    value={newRecord[column] || ''}
                    onChange={(e) => setNewRecord({ ...newRecord, [column]: e.target.value })}
                    placeholder={`Enter ${column}`}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd}>Save</Button>
            <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="table-container overflow-auto">
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              {columns.map(column => (
                <TableHead key={column}>{column}</TableHead>
              ))}
              <TableHead className="actions-column">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {data.map((row, rowIndex) => {
              const rowId = row.__internalId || `row-${rowIndex}`;
              const isEditing = editingRow === rowId;

              return (
                <TableRow key={rowId} className={isEditing ? 'editing' : ''}>
                  {columns.map(column => (
                    <TableCell key={column}>
                      {isEditing && column !== 'id' && column !== '_id' ? (
                        (() => {
                          const meta = columnMeta.find(m => m.column_name === column);
                          if (meta?.enum_values?.length) {
                            return (
                              <select
                                value={editData[column] ?? ''}
                                onChange={(e) => setEditData({ ...editData, [column]: e.target.value })}
                                className="h-9 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm w-full"
                              >
                                <option value="">Select {column}</option>
                                {meta.enum_values.map(v => <option key={v} value={v}>{v}</option>)}
                              </select>
                            );
                          }

                          return (
                            <Input
                              value={editData[column] || ''}
                              onChange={(e) => setEditData({ ...editData, [column]: e.target.value })}
                              className="h-9"
                            />
                          );
                        })()
                      ) : (
                        <span className="cell-content">{String(row[column])}</span>
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="actions-column">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleSave(rowId)}>✓</Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditingRow(null); setEditData({}); }}>✕</Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" aria-label={`Edit row ${rowId}`} onClick={() => handleEdit(row)}>Edit</Button>
                        <Button size="sm" variant="destructive" aria-label={`Delete row ${rowId}`} onClick={() => handleDelete(rowId)}>Delete</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="table-pagination flex items-center justify-between p-4 border-t">
        <Button onClick={prevPage} disabled={pagination.offset === 0} variant="outline">← Previous</Button>
        <span className="pagination-info text-sm text-slate-600">
          Showing {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.count)} of {pagination.count}
        </span>
        <Button onClick={nextPage} disabled={pagination.offset + pagination.limit >= pagination.count} variant="outline">Next →</Button>
      </div>
    </div>
  );
}

export default TableView;
