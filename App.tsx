
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Dataset, ChatMessage, AnalysisStatus, AnalysisSession, Theme, ColumnStats, SortConfig, CleaningSuggestion, DashboardTile, ChartConfig, KPIMetric, ActiveFilter, FilterOperator } from './types';
import { analyzeData, getCleaningSuggestions } from './services/geminiService';
import { ChartRenderer } from './components/ChartRenderer';
import { 
  Search, Upload, FileText, Send, Database, BarChart3, Plus, 
  Trash2, Menu, Moon, Sun, DownloadCloud, ArrowUpDown, Filter, X,
  Sparkles, CheckCircle2, AlertCircle, RefreshCcw, Bell, Settings, 
  LogOut, Shield, HardDrive, Info, Share2, FileCode, Table as TableIcon,
  ChevronRight, Lightbulb, Zap, LayoutDashboard, MessageCircle, TrendingUp,
  ArrowUpRight, ArrowDownRight, Layers, GripVertical, ListFilter, Eraser,
  Wand2, Check, ShieldAlert, Sparkle, PlusCircle, FilterX
} from 'lucide-react';

const ROW_HEIGHT = 65; 
const BUFFER_COUNT = 5;

const App: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    return (saved === 'dark' || saved === 'light') ? saved : 'light';
  });
  
  const [datasets, setDatasets] = useState<Dataset[]>(() => JSON.parse(localStorage.getItem('datasets') || '[]'));
  const [sessions, setSessions] = useState<AnalysisSession[]>(() => JSON.parse(localStorage.getItem('sessions') || '[]'));
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(() => datasets[0]?.id || null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => sessions[0]?.id || null);
  const [view, setView] = useState<'chat' | 'data' | 'dashboard'>('chat');
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCleaningModalOpen, setIsCleaningModalOpen] = useState(false);
  const [isFilterBuilderOpen, setIsFilterBuilderOpen] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'info' | 'error'} | null>(null);
  const [cleaningSuggestions, setCleaningSuggestions] = useState<CleaningSuggestion[]>([]);
  
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: '', direction: null });

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [editingCell, setEditingCell] = useState<{ rowIndex: number, column: string } | null>(null);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);

  const [scrollTop, setScrollTop] = useState(0);
  const [tableContainerHeight, setTableContainerHeight] = useState(0);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resizeRef = useRef<{ col: string, startX: number, startWidth: number } | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const activeDataset = useMemo(() => datasets.find(d => d.id === activeDatasetId), [datasets, activeDatasetId]);
  const activeSession = useMemo(() => sessions.find(s => s.id === activeSessionId), [sessions, activeSessionId]);

  useEffect(() => {
    if (view !== 'data' || !tableContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTableContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(tableContainerRef.current);
    return () => observer.disconnect();
  }, [view]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('datasets', JSON.stringify(datasets));
    localStorage.setItem('sessions', JSON.stringify(sessions));
  }, [datasets, sessions]);

  useEffect(() => {
    if (activeDataset && columnOrder.length === 0) {
      setColumnOrder(activeDataset.columns);
    }
  }, [activeDataset]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => setNotification({ message, type });

  const handleGetCleaningSuggestions = async () => {
    if (!activeDataset) return;
    setStatus(AnalysisStatus.LOADING);
    try {
      const suggestions = await getCleaningSuggestions(activeDataset.summary, activeDataset.rows.slice(0, 15));
      setCleaningSuggestions(suggestions);
      setStatus(AnalysisStatus.SUCCESS);
    } catch (err) {
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const applyCleaningSuggestion = (suggestion: CleaningSuggestion) => {
    if (!activeDatasetId) return;
    setDatasets(prev => prev.map(d => {
      if (d.id !== activeDatasetId) return d;
      let newRows = [...d.rows];
      switch (suggestion.actionType) {
        case 'remove_nulls':
          newRows = newRows.filter(r => r[suggestion.column] !== null && r[suggestion.column] !== undefined && r[suggestion.column] !== '');
          break;
        case 'deduplicate':
          const seen = new Set();
          newRows = newRows.filter(r => {
            const val = JSON.stringify(r);
            if (seen.has(val)) return false;
            seen.add(val);
            return true;
          });
          break;
        case 'normalize':
          newRows = newRows.map(r => ({
            ...r,
            [suggestion.column]: typeof r[suggestion.column] === 'string' ? r[suggestion.column].trim() : r[suggestion.column]
          }));
          break;
        case 'convert_types':
          newRows = newRows.map(r => {
            const val = r[suggestion.column];
            let newVal = val;
            if (!isNaN(Number(val)) && val !== '') newVal = Number(val);
            return { ...r, [suggestion.column]: newVal };
          });
          break;
      }
      return { ...d, rows: newRows };
    }));
    setCleaningSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
    showToast(`Successfully applied: ${suggestion.suggestion}`);
  };

  const rejectCleaningSuggestion = (suggestionId: string) => {
    setCleaningSuggestions(prev => prev.filter(s => s.id !== suggestionId));
    showToast("Suggestion dismissed", "info");
  };

  const pinToDashboard = (config: ChartConfig) => {
    if (!activeSessionId) return;
    const newTile: DashboardTile = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'chart',
      config,
      w: 2 
    };
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, dashboardTiles: [...s.dashboardTiles, newTile] } : s));
    showToast("Visual pinned to Dashboard!");
  };

  const removeTile = (tileId: string) => {
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, dashboardTiles: s.dashboardTiles.filter(t => t.id !== tileId) } : s));
  };

  const stats = useMemo(() => {
    if (!activeDataset) return {};
    const results: Record<string, ColumnStats> = {};
    activeDataset.columns.forEach(col => {
      const values = activeDataset.rows.map(r => r[col]).filter(v => typeof v === 'number');
      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        results[col] = {
          min: Math.min(...values),
          max: Math.max(...values),
          avg: sum / values.length,
          sum: sum,
          count: values.length
        };
      }
    });
    return results;
  }, [activeDataset]);

  const processedRows = useMemo(() => {
    if (!activeDataset) return [];
    let rows = [...activeDataset.rows];

    if (activeFilters.length > 0) {
      rows = rows.filter(row => {
        return activeFilters.every(f => {
          const val = row[f.column];
          switch (f.operator) {
            case 'equals': return String(val) === String(f.value);
            case 'contains': return String(val).toLowerCase().includes(String(f.value).toLowerCase());
            case 'gt': return Number(val) > Number(f.value);
            case 'lt': return Number(val) < Number(f.value);
            case 'between': return Number(val) >= Number(f.value) && Number(val) <= Number(f.valueEnd);
            default: return true;
          }
        });
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(row => Object.values(row).some(val => String(val).toLowerCase().includes(q)));
    }
    
    if (sortConfig.key && sortConfig.direction) {
      rows.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (typeof valA === 'number' && typeof valB === 'number') {
           return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
        }
        return sortConfig.direction === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
      });
    }
    return rows;
  }, [activeDataset, searchQuery, sortConfig, activeFilters]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const { visibleRows, totalContentHeight, offsetTop } = useMemo(() => {
    const totalCount = processedRows.length;
    const totalContentHeight = totalCount * ROW_HEIGHT;
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_COUNT);
    const endIndex = Math.min(totalCount, Math.ceil((scrollTop + tableContainerHeight) / ROW_HEIGHT) + BUFFER_COUNT);
    const visibleRows = processedRows.slice(startIndex, endIndex).map((row, i) => ({
      data: row,
      originalIndex: startIndex + i
    }));
    const offsetTop = startIndex * ROW_HEIGHT;
    return { visibleRows, totalContentHeight, offsetTop };
  }, [processedRows, scrollTop, tableContainerHeight]);

  const onDrillDown = (drillFilter: { column: string, value: any }) => {
    const newFilter: ActiveFilter = {
      id: Math.random().toString(36).substr(2, 9),
      column: drillFilter.column,
      operator: 'equals',
      value: drillFilter.value
    };
    setActiveFilters(prev => [...prev, newFilter]);
    setView('data');
    showToast(`Drilled into ${drillFilter.column}`);
  };

  const removeFilter = (id: string) => setActiveFilters(prev => prev.filter(f => f.id !== id));
  const clearAllFilters = () => { setActiveFilters([]); setSearchQuery(''); showToast("Workspace cleared", "info"); };

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        if (prev.direction === 'desc') return { key, direction: null };
        return { key, direction: 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const handleResizeStart = (e: React.MouseEvent, col: string) => {
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = columnWidths[col] || 150;
    resizeRef.current = { col, startX, startWidth };
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizeRef.current) return;
    const diff = e.pageX - resizeRef.current.startX;
    const newWidth = Math.max(80, resizeRef.current.startWidth + diff);
    setColumnWidths(prev => ({ ...prev, [resizeRef.current!.col]: newWidth }));
  };

  const handleResizeEnd = () => {
    resizeRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  };

  const handleColumnDragStart = (e: React.DragEvent, col: string) => {
    setDraggedColumn(col);
    e.dataTransfer.setData('column', col);
  };

  const handleColumnDrop = (e: React.DragEvent, targetCol: string) => {
    e.preventDefault();
    const sourceCol = e.dataTransfer.getData('column');
    if (!sourceCol || sourceCol === targetCol) return;
    const newOrder = [...columnOrder];
    const sIdx = newOrder.indexOf(sourceCol);
    const tIdx = newOrder.indexOf(targetCol);
    newOrder.splice(sIdx, 1);
    newOrder.splice(tIdx, 0, sourceCol);
    setColumnOrder(newOrder);
    setDraggedColumn(null);
  };

  const handleCellEdit = (rowIndex: number, column: string, value: any) => {
    if (!activeDatasetId) return;
    setDatasets(prev => prev.map(d => {
      if (d.id !== activeDatasetId) return d;
      const updatedRows = [...d.rows];
      const originalValue = updatedRows[rowIndex][column];
      const typedValue = typeof originalValue === 'number' ? Number(value) : value;
      updatedRows[rowIndex] = { ...updatedRows[rowIndex], [column]: typedValue };
      return { ...d, rows: updatedRows };
    }));
    setEditingCell(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const headers = lines[0].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)?.map(h => h.replace(/"/g, '').trim()) || [];
        const rows = lines.slice(1).map(line => {
          const vals = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
          return headers.reduce((obj, h, i) => {
            const val = vals[i]?.replace(/"/g, '').trim();
            obj[h] = isNaN(Number(val)) || val === '' ? val : Number(val);
            return obj;
          }, {} as any);
        });
        const newDs: Dataset = { id: Math.random().toString(36).substr(2, 9), name: file.name, columns: headers, rows, summary: `Dataset '${file.name}' with ${rows.length} rows.` };
        const newSess: AnalysisSession = { id: Math.random().toString(36).substr(2, 9), datasetId: newDs.id, dashboardTiles: [], messages: [{ id: 'w', role: 'assistant', content: `Executive summary of **${file.name}** prepared. Ready for query.`, timestamp: Date.now() }], lastUpdated: Date.now() };
        setDatasets(prev => [...prev, newDs]);
        setSessions(prev => [newSess, ...prev]);
        setActiveDatasetId(newDs.id);
        setActiveSessionId(newSess.id);
        setColumnOrder(newDs.columns);
        handleGetCleaningSuggestions();
        showToast("Executive Dataset Loaded");
      } catch (err) {
        showToast("Error parsing file", "error");
      }
    };
    reader.readAsText(file);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || !activeDataset || !activeSessionId) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: input, timestamp: Date.now() };
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: [...s.messages, userMsg] } : s));
    setInput('');
    setStatus(AnalysisStatus.LOADING);
    try {
      const result = await analyzeData(activeDataset.summary, userMsg.content, activeDataset.rows.slice(0, 15));
      const newAssistantMsg: ChatMessage = { id: Date.now().toString(), role: 'assistant', content: result.textResponse, chartData: result.suggestedChart, insights: result.insights, metrics: result.metrics, timestamp: Date.now() };
      setSessions(prev => prev.map(s => {
        if (s.id !== activeSessionId) return s;
        let newTiles = [...s.dashboardTiles];
        if (result.metrics && s.dashboardTiles.length < 4) {
          result.metrics.forEach((m: KPIMetric) => {
            newTiles.push({ id: Math.random().toString(36).substr(2, 9), type: 'kpi', kpi: m, w: 1 });
          });
        }
        return { ...s, messages: [...s.messages, newAssistantMsg], dashboardTiles: newTiles };
      }));
      setStatus(AnalysisStatus.SUCCESS);
    } catch (error: any) {
      setStatus(AnalysisStatus.ERROR);
      showToast(error.message, "error");
    }
  };

  const addNewFilter = (filter: Omit<ActiveFilter, 'id'>) => {
    setActiveFilters(prev => [...prev, { ...filter, id: Math.random().toString(36).substr(2, 9) }]);
    setIsFilterBuilderOpen(false);
  };

  const FilterBuilderModal = () => {
    const [selectedCol, setSelectedCol] = useState(activeDataset?.columns[0] || '');
    const [operator, setOperator] = useState<FilterOperator>('equals');
    const [val1, setVal1] = useState('');
    const [val2, setVal2] = useState('');

    const colType = stats[selectedCol] ? 'numeric' : 'categorical';

    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-xl animate-in fade-in duration-300">
        <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 transition-colors">
          <div className="p-8 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <PlusCircle size={24} className="text-indigo-600" />
              <h2 className="text-2xl font-black tracking-tighter text-slate-900 dark:text-slate-100">Add Advanced Filter</h2>
            </div>
            <button onClick={() => setIsFilterBuilderOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all dark:text-slate-400"><X size={20}/></button>
          </div>
          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Select Attribute</label>
              <select 
                value={selectedCol} 
                onChange={(e) => setSelectedCol(e.target.value)} 
                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-4 py-3 font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none dark:text-slate-100"
              >
                {activeDataset?.columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Operation</label>
              <select 
                value={operator} 
                onChange={(e) => setOperator(e.target.value as FilterOperator)} 
                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-4 py-3 font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none dark:text-slate-100"
              >
                <option value="equals">Equals</option>
                <option value="contains">Contains (Partial)</option>
                {colType === 'numeric' && (
                  <>
                    <option value="gt">Greater Than</option>
                    <option value="lt">Less Than</option>
                    <option value="between">Numeric Range</option>
                  </>
                )}
              </select>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Constraint Value</label>
              <div className="flex gap-4">
                <input 
                  type={operator === 'gt' || operator === 'lt' || operator === 'between' ? 'number' : 'text'}
                  placeholder={operator === 'between' ? 'Start' : 'Constraint...'}
                  value={val1}
                  onChange={(e) => setVal1(e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-4 py-3 font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none dark:text-slate-100"
                />
                {operator === 'between' && (
                  <input 
                    type="number"
                    placeholder="End"
                    value={val2}
                    onChange={(e) => setVal2(e.target.value)}
                    className="flex-1 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-4 py-3 font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none dark:text-slate-100"
                  />
                )}
              </div>
            </div>
          </div>
          <div className="p-8 bg-slate-50 dark:bg-slate-950 flex gap-4">
            <button 
              onClick={() => setIsFilterBuilderOpen(false)} 
              className="flex-1 py-3 font-black text-slate-400 hover:text-slate-600 transition-all uppercase text-[10px]"
            >
              Cancel
            </button>
            <button 
              onClick={() => addNewFilter({ column: selectedCol, operator, value: val1, valueEnd: val2 })}
              className="flex-1 bg-indigo-600 text-white py-3 rounded-2xl font-black shadow-lg hover:scale-[1.02] transition-all uppercase text-[10px] tracking-widest"
            >
              Apply Filter
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden transition-colors duration-500 bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="w-16 flex flex-col items-center py-6 border-r shrink-0 transition-all duration-300 z-50 bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800">
        <div className="w-10 h-10 bg-[#FFD700] rounded-xl flex items-center justify-center text-slate-900 mb-8 shadow-lg"><TrendingUp size={22} strokeWidth={3} /></div>
        <div className="flex flex-col gap-6">
          <button onClick={() => setView('chat')} className={`p-3 rounded-xl transition-all ${view === 'chat' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400'}`}><MessageCircle size={22} /></button>
          <button onClick={() => setView('dashboard')} className={`p-3 rounded-xl transition-all ${view === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400'}`}><LayoutDashboard size={22} /></button>
          <button onClick={() => setView('data')} className={`p-3 rounded-xl transition-all ${view === 'data' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400'}`}><TableIcon size={22} /></button>
          <div className="h-px w-8 bg-slate-200 dark:bg-slate-800 my-2"></div>
          <button onClick={() => setIsSettingsOpen(true)} className="p-3 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"><Settings size={22} /></button>
        </div>
        <div className="mt-auto flex flex-col gap-4">
           <button onClick={toggleTheme} className="p-3 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">{theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 relative transition-colors duration-500">
        <header className="h-14 border-b flex items-center px-8 justify-between shrink-0 transition-colors duration-300 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-40 border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-4">
            <span className="font-black text-sm uppercase tracking-widest text-slate-400">{view} view</span>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800"></div>
            <h1 className="text-sm font-black truncate max-w-sm">{activeDataset?.name || 'Power BI Enterprise'}</h1>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-black shadow-lg shadow-indigo-600/20 active:scale-95 transition-transform"><Plus size={14} strokeWidth={3} /> Get Data</button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
          </div>
        </header>

        <div className="flex-1 overflow-hidden transition-colors duration-300">
          {view === 'chat' ? (
            <div className="h-full flex flex-col relative bg-white dark:bg-slate-950 transition-colors duration-300">
               <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-12 max-w-5xl mx-auto w-full">
                  {!activeDataset && (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-8 py-20">
                      <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-[2.5rem] flex items-center justify-center shadow-2xl animate-pulse"><Layers size={48} /></div>
                      <div className="space-y-4">
                        <h2 className="text-4xl font-black tracking-tight">Enterprise Intelligence</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-lg max-w-md">Connect your dataset to generate interactive dashboards and AI insights instantly.</p>
                      </div>
                    </div>
                  )}
                  {activeSession?.messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-500`}>
                      <div className={`max-w-[95%] lg:max-w-[85%] ${msg.role === 'user' ? 'bg-indigo-600 text-white p-6 rounded-[2.5rem] rounded-tr-none shadow-xl' : 'w-full'}`}>
                        {msg.role === 'assistant' ? (
                          <div className="flex gap-8">
                             <div className="w-12 h-12 rounded-2xl bg-[#FFD700] text-slate-900 flex items-center justify-center shrink-0 border-2 border-white shadow-xl"><TrendingUp size={24} strokeWidth={3} /></div>
                             <div className="flex-1 min-w-0 space-y-8">
                                <div className="prose prose-slate dark:prose-invert max-w-none text-slate-700 dark:text-slate-200 leading-relaxed text-lg font-medium">{msg.content}</div>
                                {msg.metrics && msg.metrics.length > 0 && (
                                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                      {msg.metrics.map((m, idx) => (
                                        <div key={idx} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border dark:border-slate-800 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                                           <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600"></div>
                                           <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">{m.label}</p>
                                           <div className="flex items-baseline gap-3">
                                              <span className="text-3xl font-black text-slate-900 dark:text-slate-100">{m.value}</span>
                                              {m.trend !== undefined && (
                                                 <span className={`text-xs font-bold flex items-center gap-1 ${m.trend > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{m.trend > 0 ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}{Math.abs(m.trend)}%</span>
                                              )}
                                           </div>
                                        </div>
                                      ))}
                                   </div>
                                )}
                                {msg.chartData && <ChartRenderer config={msg.chartData} theme={theme} onDrillDown={onDrillDown} onPin={pinToDashboard} />}
                                {msg.insights && msg.insights.length > 0 && (
                                   <div className="bg-slate-50 dark:bg-slate-900/50 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 transition-colors">
                                      <h4 className="flex items-center gap-3 text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4"><Lightbulb size={18} className="text-yellow-500" /> Strategic Takeaways</h4>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                         {msg.insights.map((ins, i) => (
                                           <div key={i} className="flex gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border dark:border-slate-800 shadow-sm transition-colors">
                                              <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0"><span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{i+1}</span></div>
                                              <p className="text-sm font-bold text-slate-600 dark:text-slate-300 leading-snug">{ins}</p>
                                           </div>
                                         ))}
                                      </div>
                                   </div>
                                )}
                             </div>
                          </div>
                        ) : <div className="text-lg font-black leading-tight">{msg.content}</div>}
                      </div>
                    </div>
                  ))}
                  {status === AnalysisStatus.LOADING && (
                    <div className="flex gap-6 items-center">
                       <div className="w-12 h-12 rounded-2xl bg-[#FFD700] flex items-center justify-center animate-bounce shadow-xl"><TrendingUp size={24} strokeWidth={3} className="text-slate-900" /></div>
                       <div className="h-4 w-48 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 animate-progress"></div></div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
               </div>
               <div className="p-8 border-t dark:border-slate-800 transition-colors">
                  <div className="max-w-4xl mx-auto">
                    <form onSubmit={handleSendMessage} className="group flex items-center gap-4 p-4 border-2 rounded-[2.5rem] transition-all bg-white dark:bg-slate-900 shadow-2xl border-slate-100 dark:border-slate-800 focus-within:border-indigo-500 focus-within:ring-8 focus-within:ring-indigo-500/5">
                      <textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }}} placeholder="Ask for trends, forecast, or a specific visual..." className="flex-1 bg-transparent border-none focus:ring-0 text-lg px-4 py-2 resize-none max-h-48 font-bold placeholder:text-slate-300 dark:placeholder:text-slate-600 dark:text-slate-100" disabled={!activeDataset || status === AnalysisStatus.LOADING} />
                      <button type="submit" disabled={!input.trim() || status === AnalysisStatus.LOADING} className="bg-indigo-600 text-white p-4 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50"><Send size={24} strokeWidth={3} /></button>
                    </form>
                  </div>
               </div>
            </div>
          ) : view === 'dashboard' ? (
            <div className="h-full overflow-y-auto p-12 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
               <div className="max-w-7xl mx-auto space-y-12">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-8">
                     <div>
                        <h2 className="text-4xl font-black tracking-tighter">Report Canvas</h2>
                        <p className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">Personalized executive dashboard</p>
                     </div>
                     <div className="flex gap-4"><button className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-5 py-2.5 rounded-2xl text-xs font-black hover:shadow-lg transition-all dark:text-slate-100"><DownloadCloud size={16} /> Export Report</button></div>
                  </div>
                  {(!activeSession || activeSession.dashboardTiles.length === 0) ? (
                    <div className="h-96 flex flex-col items-center justify-center text-center space-y-6 bg-white dark:bg-slate-900 rounded-[3rem] border-4 border-dashed border-slate-200 dark:border-slate-800 transition-colors">
                       <LayoutDashboard size={64} className="text-slate-200 dark:text-slate-800" />
                       <div className="space-y-2"><p className="text-xl font-black text-slate-800 dark:text-slate-200">Canvas is Empty</p><p className="text-slate-400 dark:text-slate-500 text-sm">Ask Ada a question and pin visuals to build your report.</p></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-8">
                       {activeSession.dashboardTiles.map(tile => (
                         <div key={tile.id} className={`relative group animate-in zoom-in-95 duration-500 ${tile.w === 1 ? 'col-span-1' : tile.w === 2 ? 'col-span-2' : 'col-span-4'}`}>
                            {tile.type === 'kpi' && tile.kpi ? (
                               <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-xl transition-all h-full min-h-[160px] flex flex-col justify-center">
                                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">{tile.kpi.label}</p>
                                  <div className="flex items-baseline gap-4">
                                     <span className="text-4xl font-black text-slate-900 dark:text-slate-100">{tile.kpi.value}</span>
                                     {tile.kpi.trend && (
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${tile.kpi.trend > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{tile.kpi.trend > 0 ? '+' : ''}{tile.kpi.trend}%</span>
                                     )}
                                  </div>
                               </div>
                            ) : tile.config ? <ChartRenderer config={tile.config} theme={theme} isDashboardTile onDrillDown={onDrillDown} /> : null}
                            <button onClick={() => removeTile(tile.id)} className="absolute -top-3 -right-3 p-2 bg-white dark:bg-slate-800 text-slate-400 hover:text-rose-600 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 opacity-0 group-hover:opacity-100 transition-all"><X size={16} /></button>
                         </div>
                       ))}
                    </div>
                  )}
               </div>
            </div>
          ) : (
            <div className="h-full overflow-hidden p-6 md:p-12 bg-white dark:bg-slate-950 transition-colors duration-300 flex flex-col">
               <div className="max-w-7xl mx-auto w-full space-y-8 flex flex-col h-full">
                  <div className="flex items-end justify-between border-b border-slate-100 dark:border-slate-800 pb-8 shrink-0">
                     <div className="space-y-2">
                        <h2 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white">Data Explorer</h2>
                        <div className="flex items-center gap-4 text-slate-400 dark:text-slate-500 font-bold text-[10px] uppercase tracking-widest"><span className="flex items-center gap-2"><Database size={12}/> {activeDataset?.rows.length.toLocaleString()} RECORDS</span></div>
                     </div>
                     <div className="flex items-center gap-4">
                        <button onClick={() => setIsCleaningModalOpen(true)} className="flex items-center gap-2 px-6 py-3.5 bg-indigo-600 text-white rounded-2xl text-sm font-black shadow-lg shadow-indigo-600/20 hover:scale-105 active:scale-95 transition-all"><Wand2 size={18} /> Clean Data{cleaningSuggestions.length > 0 && <span className="bg-white text-indigo-600 w-5 h-5 rounded-full flex items-center justify-center text-[10px]">{cleaningSuggestions.length}</span>}</button>
                        <div className="relative group"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="text" placeholder="Power Query..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-12 pr-6 py-3.5 bg-slate-50 dark:bg-slate-900 border-none rounded-2xl text-sm font-bold w-64 md:w-80 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none dark:text-slate-100" /></div>
                     </div>
                  </div>

                  {/* Enhanced Filter Section */}
                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <button 
                      onClick={() => setIsFilterBuilderOpen(true)}
                      className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 hover:border-indigo-600/20 transition-all"
                    >
                      <ListFilter size={16} /> Add Constraint
                    </button>
                    {activeFilters.length > 0 && (
                      <button 
                        onClick={clearAllFilters}
                        className="flex items-center gap-2 px-4 py-3 bg-rose-50 dark:bg-rose-900/10 text-rose-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all"
                      >
                        <FilterX size={16} /> Clear All
                      </button>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {activeFilters.map(f => (
                        <div key={f.id} className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 px-4 py-2 rounded-2xl group animate-in zoom-in-95 duration-200">
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black text-indigo-400 uppercase tracking-tighter leading-none mb-0.5">{f.column}</span>
                            <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 leading-none">
                              {f.operator === 'between' ? `${f.value} → ${f.valueEnd}` : `${f.operator.toUpperCase()}: ${f.value}`}
                            </span>
                          </div>
                          <button onClick={() => removeFilter(f.id)} className="text-indigo-300 hover:text-indigo-600 transition-all">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 shrink-0">
                     {Object.entries(stats).slice(0, 4).map(([col, data]) => (
                        <div key={col} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors relative overflow-hidden group">
                           <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 truncate">{col}</p>
                           <div className="flex items-end justify-between">
                              <span className="text-2xl font-black text-slate-900 dark:text-slate-100">{data.avg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                              <div className="text-[10px] font-black text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-lg">AVG</div>
                           </div>
                        </div>
                     ))}
                  </div>

                  <div ref={tableContainerRef} onScroll={handleScroll} className="flex-1 bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 overflow-auto shadow-2xl transition-colors relative">
                    <div style={{ height: totalContentHeight, width: '100%', position: 'relative' }}>
                      <table className="w-full text-left text-sm border-collapse table-fixed sticky top-0 z-10 bg-white dark:bg-slate-900">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/50 transition-colors">
                            {columnOrder.map(col => (
                              <th key={col} draggable onDragStart={(e) => handleColumnDragStart(e, col)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleColumnDrop(e, col)} style={{ width: columnWidths[col] || 150 }} className={`relative px-8 py-6 font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-[10px] transition-all border-b border-slate-100 dark:border-slate-800 ${draggedColumn === col ? 'opacity-30' : ''}`}>
                                <div className="flex items-center gap-3 cursor-grab active:cursor-grabbing"><GripVertical size={12} className="opacity-30 shrink-0" /><span className={`flex-1 truncate ${activeFilters.some(f => f.column === col) ? 'text-indigo-600 dark:text-indigo-400' : ''}`} onClick={() => handleSort(col)}>{col}</span><div className="flex items-center gap-1 shrink-0"><ArrowUpDown size={12} className={sortConfig.key === col ? 'text-indigo-600' : 'opacity-20'} onClick={() => handleSort(col)} /></div></div>
                                <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500 transition-colors" onMouseDown={(e) => handleResizeStart(e, col)}/>
                              </th>
                            ))}
                          </tr>
                        </thead>
                      </table>
                      <table className="w-full text-left text-sm border-collapse table-fixed absolute top-0 left-0" style={{ transform: `translateY(${offsetTop}px)` }}>
                        <thead className="invisible h-0"><tr>{columnOrder.map(col => (<th key={`align-${col}`} style={{ width: columnWidths[col] || 150 }} className="p-0 border-none" />))}</tr></thead>
                        <tbody className="divide-y border-slate-100 dark:border-slate-800">
                          {visibleRows.map(({ data: row, originalIndex: i }) => (
                            <tr key={i} style={{ height: ROW_HEIGHT }} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                              {columnOrder.map(col => {
                                const isEditing = editingCell?.rowIndex === i && editingCell?.column === col;
                                return (
                                  <td key={`${i}-${col}`} className={`px-8 py-4 whitespace-nowrap font-bold text-slate-600 dark:text-slate-300 ${isEditing ? 'p-0' : ''}`} onDoubleClick={() => setEditingCell({ rowIndex: i, column: col })}>
                                    {isEditing ? <input autoFocus type={typeof row[col] === 'number' ? 'number' : 'text'} defaultValue={row[col]} onBlur={(e) => handleCellEdit(i, col, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCellEdit(i, col, e.currentTarget.value); if (e.key === 'Escape') setEditingCell(null); }} className="w-full h-full px-8 py-4 bg-indigo-50 dark:bg-indigo-900/30 border-2 border-indigo-600 outline-none text-slate-900 dark:text-slate-100" /> : <span className="truncate block">{typeof row[col] === 'number' ? row[col].toLocaleString() : row[col]}</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* Filter Builder Modal */}
        {isFilterBuilderOpen && <FilterBuilderModal />}

        {notification && (
           <div className="fixed bottom-32 right-8 z-[100] animate-in slide-in-from-right-10 fade-in duration-500"><div className={`px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-4 ${notification.type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'}`}><div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">{notification.type === 'success' ? <CheckCircle2 size={18}/> : <Info size={18}/>}</div><span className="text-sm font-black tracking-tight">{notification.message}</span></div></div>
        )}

        {isSettingsOpen && (
           <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-xl animate-in fade-in duration-300">
              <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 transition-colors">
                 <div className="p-10 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center"><div><h2 className="text-3xl font-black tracking-tighter text-slate-900 dark:text-slate-100">System Configuration</h2><p className="text-slate-400 dark:text-slate-500 font-bold text-sm">Fine-tune your analysis engine</p></div><button onClick={() => setIsSettingsOpen(false)} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all dark:text-slate-400"><X size={24}/></button></div>
                 <div className="p-10 space-y-10"><div className="space-y-4"><h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Display Settings</h3><div className="grid grid-cols-2 gap-6"><button onClick={() => setTheme('light')} className={`p-6 rounded-[2rem] border-4 transition-all flex flex-col items-center gap-4 font-black ${theme === 'light' ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-100 dark:border-slate-800 text-slate-400'}`}><Sun size={32}/> Light Mode</button><button onClick={() => setTheme('dark')} className={`p-6 rounded-[2rem] border-4 transition-all flex flex-col items-center gap-4 font-black ${theme === 'dark' ? 'border-indigo-600 bg-indigo-900/20 text-indigo-400' : 'border-slate-100 dark:border-slate-800 text-slate-400'}`}><Moon size={32}/> Dark Mode</button></div></div><button onClick={() => { localStorage.clear(); window.location.reload(); }} className="w-full py-4 rounded-2xl border-2 border-rose-100 dark:border-rose-900/30 text-rose-500 font-black flex items-center justify-center gap-3 hover:bg-rose-50 dark:hover:bg-rose-900/10 transition-all"><Trash2 size={20}/> Factory Reset Environment</button></div>
                 <div className="p-10 bg-slate-50 dark:bg-slate-950 flex justify-end"><button onClick={() => setIsSettingsOpen(false)} className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all">Apply Changes</button></div>
              </div>
           </div>
        )}

        {isCleaningModalOpen && (
           <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-xl animate-in fade-in duration-300">
              <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-[3.5rem] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 transition-colors flex flex-col max-h-[90vh]">
                 <div className="p-10 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center"><div><div className="flex items-center gap-3 mb-2"><div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/20"><Sparkle size={20} /></div><h2 className="text-3xl font-black tracking-tighter text-slate-900 dark:text-slate-100 uppercase">Power Clean AI</h2></div></div><button onClick={() => setIsCleaningModalOpen(false)} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all dark:text-slate-400"><X size={24}/></button></div>
                 <div className="flex-1 overflow-y-auto p-10 space-y-8 bg-slate-50/50 dark:bg-slate-950/50">{cleaningSuggestions.map((s) => (<div key={s.id} className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border dark:border-slate-800 shadow-sm flex flex-col justify-between group"><div className="space-y-4"><div className="px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest bg-indigo-50 text-indigo-500 inline-block">{s.severity} PRIORITY</div><h4 className="text-lg font-black text-slate-900 dark:text-slate-100 leading-tight">{s.issue}</h4><p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed italic border-l-2 border-indigo-200 dark:border-indigo-800 pl-4">"{s.suggestion}"</p></div><div className="mt-8 flex gap-3"><button onClick={() => applyCleaningSuggestion(s)} className="flex-1 bg-indigo-600 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all">Accept Fix</button><button onClick={() => rejectCleaningSuggestion(s.id)} className="px-5 py-3 border border-slate-200 dark:border-slate-800 text-slate-400 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"><X size={16} /></button></div></div>))}</div>
                 <div className="p-10 bg-slate-50 dark:bg-slate-950 flex justify-end border-t border-slate-200 dark:border-slate-800"><button onClick={() => setIsCleaningModalOpen(false)} className="bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-10 py-4 rounded-2xl font-black shadow-xl hover:scale-105 transition-all text-xs uppercase tracking-widest">Done</button></div>
              </div>
           </div>
        )}
      </main>

      <style>{`
        @keyframes progress { 0% { transform: translateX(-100%); } 50% { transform: translateX(0); } 100% { transform: translateX(100%); } }
        .animate-progress { animation: progress 2s infinite ease-in-out; }
        .cursor-col-resize { cursor: col-resize; } .cursor-grab { cursor: grab; } .cursor-grabbing { cursor: grabbing; }
        ::-webkit-scrollbar { width: 8px; height: 8px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .dark ::-webkit-scrollbar-thumb { background: #1e293b; } ::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
};

export default App;
