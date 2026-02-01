
export interface Dataset {
  id: string;
  name: string;
  columns: string[];
  rows: any[];
  summary: string;
  metadata?: Record<string, ColumnMetadata>;
}

export interface ColumnMetadata {
  type: 'numeric' | 'categorical' | 'date' | 'unknown';
  stats: ColumnStats;
  uniqueValues?: number;
}

export interface KPIMetric {
  label: string;
  value: string | number;
  trend?: number; // percentage
  description?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  chartData?: ChartConfig;
  timestamp: number;
  insights?: string[];
  metrics?: KPIMetric[];
  isError?: boolean;
}

export interface ChartConfig {
  type: 'bar' | 'line' | 'scatter' | 'pie' | 'area' | 'radar' | 'boxplot';
  title: string;
  data: { 
    x: string | number; 
    y: number; 
    min?: number; 
    max?: number; 
    q1?: number; 
    q3?: number; 
    median?: number;
    originalRow?: any 
  }[];
  xAxisLabel: string;
  yAxisLabel: string;
  color?: string;
  id?: string;
}

export interface DashboardTile {
  id: string;
  type: 'chart' | 'kpi';
  config?: ChartConfig;
  kpi?: KPIMetric;
  w: number; // grid width 1-4
}

export interface CleaningSuggestion {
  id: string;
  column: string;
  issue: string;
  suggestion: string;
  severity: 'low' | 'medium' | 'high';
  actionType?: 'remove_nulls' | 'normalize' | 'convert_types' | 'deduplicate';
}

export interface AnalysisSession {
  id: string;
  datasetId: string;
  messages: ChatMessage[];
  dashboardTiles: DashboardTile[];
  lastUpdated: number;
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS'
}

export type Theme = 'light' | 'dark';

export interface ColumnStats {
  min: number;
  max: number;
  avg: number;
  sum: number;
  count: number;
}

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc' | null;
}

export type FilterOperator = 'equals' | 'contains' | 'gt' | 'lt' | 'between';

export interface ActiveFilter {
  id: string;
  column: string;
  operator: FilterOperator;
  value: any;
  valueEnd?: any; // For range filtering
}
