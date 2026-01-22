import { dbOperations } from '@/lib/db';
import { exportForTraining, exportToJsonl, parseJsonlFile } from '@/lib/jsonl';
import { downloadFile } from '@/lib/utils';
import type { ReviewFilters, ReviewItem, ReviewStats } from '@/types/review';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface ReviewStore {
  // State
  items: ReviewItem[];
  selectedItemId: string | null;
  selectedIds: Set<string>;
  filters: ReviewFilters;
  stats: ReviewStats;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadItems: () => Promise<void>;
  setSelectedItem: (id: string | null) => void;
  toggleItemSelection: (id: string) => void;
  selectAllItems: () => void;
  clearSelection: () => void;
  setFilters: (filters: Partial<ReviewFilters>) => void;
  resetFilters: () => void;

  // Item operations
  updateItemStatus: (id: string, status: ReviewItem['status']) => Promise<void>;
  bulkUpdateStatus: (status: ReviewItem['status']) => Promise<void>;
  updateContextChunks: (id: string, chunks: ReviewItem['input']['context_chunks']) => Promise<void>;
  updateHumanFeedback: (
    id: string,
    feedback: Partial<ReviewItem['human_feedback']>
  ) => Promise<void>;
  deleteItems: (ids: string[]) => Promise<void>;

  // Import/Export
  importFile: (file: File) => Promise<{ success: boolean; message: string }>;
  exportItems: (options?: { includeMetadata?: boolean }) => void;
  exportForTraining: () => void;
  clearAllData: () => Promise<void>;

  // Computed
  getFilteredItems: () => ReviewItem[];
  getSelectedItem: () => ReviewItem | undefined;
}

const defaultFilters: ReviewFilters = {
  status: 'all',
  tags: [],
  modelId: undefined,
  search: '',
  sortBy: 'created_at',
  sortOrder: 'desc',
};

const defaultStats: ReviewStats = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  modified: 0,
};

export const useReviewStore = create<ReviewStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    items: [],
    selectedItemId: null,
    selectedIds: new Set(),
    filters: defaultFilters,
    stats: defaultStats,
    isLoading: false,
    error: null,

    // Load items from IndexedDB
    loadItems: async () => {
      set({ isLoading: true, error: null });
      try {
        const items = await dbOperations.getAllItems();
        const counts = await dbOperations.getStatusCounts();
        set({
          items,
          stats: {
            total: counts.total,
            pending: counts.pending || 0,
            approved: counts.approved || 0,
            rejected: counts.rejected || 0,
            modified: counts.modified || 0,
          },
          isLoading: false,
        });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to load items',
          isLoading: false,
        });
      }
    },

    // Selection
    setSelectedItem: (id) => set({ selectedItemId: id }),

    toggleItemSelection: (id) => {
      const { selectedIds } = get();
      const newSelected = new Set(selectedIds);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      set({ selectedIds: newSelected });
    },

    selectAllItems: () => {
      const filteredItems = get().getFilteredItems();
      set({ selectedIds: new Set(filteredItems.map((item) => item.id)) });
    },

    clearSelection: () => set({ selectedIds: new Set() }),

    // Filters
    setFilters: (filters) =>
      set((state) => ({
        filters: { ...state.filters, ...filters },
      })),

    resetFilters: () => set({ filters: defaultFilters }),

    // Item operations
    updateItemStatus: async (id, status) => {
      try {
        await dbOperations.updateStatus(id, status);
        await get().loadItems();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to update status' });
      }
    },

    bulkUpdateStatus: async (status) => {
      const { selectedIds } = get();
      if (selectedIds.size === 0) return;

      try {
        await dbOperations.bulkUpdateStatus(Array.from(selectedIds), status);
        set({ selectedIds: new Set() });
        await get().loadItems();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to update items' });
      }
    },

    updateContextChunks: async (id, chunks) => {
      try {
        await dbOperations.updateContextChunks(id, chunks);
        await get().loadItems();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to update context' });
      }
    },

    updateHumanFeedback: async (id, feedback) => {
      try {
        await dbOperations.updateHumanFeedback(id, feedback);
        await get().loadItems();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to update feedback' });
      }
    },

    deleteItems: async (ids) => {
      try {
        await dbOperations.deleteItems(ids);
        set((state) => ({
          selectedIds: new Set([...state.selectedIds].filter((id) => !ids.includes(id))),
          selectedItemId: ids.includes(state.selectedItemId || '') ? null : state.selectedItemId,
        }));
        await get().loadItems();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to delete items' });
      }
    },

    // Import/Export
    importFile: async (file) => {
      set({ isLoading: true, error: null });
      try {
        const result = await parseJsonlFile(file);

        if (result.items.length > 0) {
          await dbOperations.addItems(result.items);
          await get().loadItems();
        }

        set({ isLoading: false });
        return {
          success: result.items.length > 0,
          message:
            result.items.length > 0
              ? `Successfully imported ${result.items.length} items${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ''}`
              : 'No valid items found in file',
        };
      } catch (error) {
        set({ isLoading: false, error: error instanceof Error ? error.message : 'Import failed' });
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Import failed',
        };
      }
    },

    exportItems: (options) => {
      const { items, filters } = get();
      let itemsToExport = items;

      // Filter by status if not 'all'
      if (filters.status && filters.status !== 'all') {
        itemsToExport = items.filter((item) => item.status === filters.status);
      } else {
        // By default, export approved and modified items
        itemsToExport = items.filter(
          (item) => item.status === 'approved' || item.status === 'modified'
        );
      }

      if (itemsToExport.length === 0) {
        return;
      }

      const jsonl = exportToJsonl(itemsToExport, options);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadFile(jsonl, `loopdeck-export-${timestamp}.jsonl`, 'application/jsonl');
    },

    exportForTraining: () => {
      const { items } = get();
      const approvedItems = items.filter(
        (item) => item.status === 'approved' || item.status === 'modified'
      );

      if (approvedItems.length === 0) {
        return;
      }

      const jsonl = exportForTraining(approvedItems);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadFile(jsonl, `loopdeck-training-${timestamp}.jsonl`, 'application/jsonl');
    },

    clearAllData: async () => {
      try {
        await dbOperations.clearAll();
        set({
          items: [],
          selectedItemId: null,
          selectedIds: new Set(),
          stats: defaultStats,
        });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to clear data' });
      }
    },

    // Computed values
    getFilteredItems: () => {
      const { items, filters } = get();
      let filtered = [...items];

      // Filter by status
      if (filters.status && filters.status !== 'all') {
        filtered = filtered.filter((item) => item.status === filters.status);
      }

      // Filter by tags
      if (filters.tags && filters.tags.length > 0) {
        filtered = filtered.filter((item) => filters.tags!.some((tag) => item.tags?.includes(tag)));
      }

      // Filter by model
      if (filters.modelId) {
        filtered = filtered.filter((item) =>
          item.outputs.some((o) => o.model_id === filters.modelId)
        );
      }

      // Filter by search text
      if (filters.search) {
        const search = filters.search.toLowerCase();
        filtered = filtered.filter(
          (item) =>
            item.input.prompt.toLowerCase().includes(search) ||
            item.outputs.some((o) => o.text.toLowerCase().includes(search))
        );
      }

      // Sort
      if (filters.sortBy) {
        filtered.sort((a, b) => {
          let aVal: string | number;
          let bVal: string | number;

          switch (filters.sortBy) {
            case 'created_at':
              aVal = a.created_at;
              bVal = b.created_at;
              break;
            case 'updated_at':
              aVal = a.updated_at;
              bVal = b.updated_at;
              break;
            case 'status':
              aVal = a.status;
              bVal = b.status;
              break;
            default:
              aVal = a.created_at;
              bVal = b.created_at;
          }

          if (filters.sortOrder === 'asc') {
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          }
          return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        });
      }

      return filtered;
    },

    getSelectedItem: () => {
      const { items, selectedItemId } = get();
      return items.find((item) => item.id === selectedItemId);
    },
  }))
);
