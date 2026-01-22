import type { ReviewItem } from '@/types/review';
import Dexie, { type EntityTable } from 'dexie';

// Database schema version
const DB_VERSION = 1;

// LoopDeck Database class
class LoopDeckDatabase extends Dexie {
  reviewItems!: EntityTable<ReviewItem, 'id'>;

  constructor() {
    super('LoopDeckDB');

    this.version(DB_VERSION).stores({
      reviewItems: 'id, status, created_at, updated_at, sync_status, *tags',
    });
  }
}

// Singleton database instance
export const db = new LoopDeckDatabase();

// Database operations
export const dbOperations = {
  /**
   * Add a single review item
   */
  async addItem(item: ReviewItem): Promise<string> {
    return await db.reviewItems.add(item);
  },

  /**
   * Add multiple review items (bulk insert)
   */
  async addItems(items: ReviewItem[]): Promise<void> {
    await db.reviewItems.bulkAdd(items);
  },

  /**
   * Get a review item by ID
   */
  async getItem(id: string): Promise<ReviewItem | undefined> {
    return await db.reviewItems.get(id);
  },

  /**
   * Get all review items
   */
  async getAllItems(): Promise<ReviewItem[]> {
    return await db.reviewItems.toArray();
  },

  /**
   * Get items by status
   */
  async getItemsByStatus(status: ReviewItem['status']): Promise<ReviewItem[]> {
    return await db.reviewItems.where('status').equals(status).toArray();
  },

  /**
   * Get items count by status
   */
  async getStatusCounts(): Promise<Record<string, number>> {
    const statuses = ['pending', 'approved', 'rejected', 'modified'];
    const counts: Record<string, number> = {};

    for (const status of statuses) {
      counts[status] = await db.reviewItems.where('status').equals(status).count();
    }

    counts.total = await db.reviewItems.count();
    return counts;
  },

  /**
   * Update a review item
   */
  async updateItem(id: string, updates: Partial<ReviewItem>): Promise<void> {
    await db.reviewItems.update(id, {
      ...updates,
      updated_at: new Date().toISOString(),
    });
  },

  /**
   * Update item status
   */
  async updateStatus(id: string, status: ReviewItem['status']): Promise<void> {
    await db.reviewItems.update(id, {
      status,
      updated_at: new Date().toISOString(),
    });
  },

  /**
   * Update context chunks (for reordering/excluding)
   */
  async updateContextChunks(
    id: string,
    contextChunks: ReviewItem['input']['context_chunks']
  ): Promise<void> {
    const item = await db.reviewItems.get(id);
    if (item) {
      await db.reviewItems.update(id, {
        input: {
          ...item.input,
          context_chunks: contextChunks,
        },
        status: item.status === 'pending' ? 'modified' : item.status,
        updated_at: new Date().toISOString(),
      });
    }
  },

  /**
   * Update human feedback
   */
  async updateHumanFeedback(
    id: string,
    feedback: Partial<ReviewItem['human_feedback']>
  ): Promise<void> {
    const item = await db.reviewItems.get(id);
    if (item) {
      await db.reviewItems.update(id, {
        human_feedback: {
          ...item.human_feedback,
          ...feedback,
        },
        updated_at: new Date().toISOString(),
      });
    }
  },

  /**
   * Bulk update status
   */
  async bulkUpdateStatus(ids: string[], status: ReviewItem['status']): Promise<void> {
    const now = new Date().toISOString();
    await db.reviewItems.where('id').anyOf(ids).modify({
      status,
      updated_at: now,
    });
  },

  /**
   * Delete a review item
   */
  async deleteItem(id: string): Promise<void> {
    await db.reviewItems.delete(id);
  },

  /**
   * Delete multiple items
   */
  async deleteItems(ids: string[]): Promise<void> {
    await db.reviewItems.bulkDelete(ids);
  },

  /**
   * Clear all items
   */
  async clearAll(): Promise<void> {
    await db.reviewItems.clear();
  },

  /**
   * Search items by prompt text
   */
  async searchByPrompt(searchText: string): Promise<ReviewItem[]> {
    const allItems = await db.reviewItems.toArray();
    const lowerSearch = searchText.toLowerCase();
    return allItems.filter(
      (item) =>
        item.input.prompt.toLowerCase().includes(lowerSearch) ||
        item.outputs.some((o) => o.text.toLowerCase().includes(lowerSearch))
    );
  },

  /**
   * Get items with pagination
   */
  async getItemsPaginated(
    page: number,
    pageSize: number,
    status?: ReviewItem['status']
  ): Promise<{ items: ReviewItem[]; total: number }> {
    const collection = db.reviewItems.orderBy('created_at').reverse();

    if (status) {
      const items = await db.reviewItems
        .where('status')
        .equals(status)
        .reverse()
        .sortBy('created_at');
      const total = items.length;
      const paginatedItems = items.slice((page - 1) * pageSize, page * pageSize);
      return { items: paginatedItems, total };
    }

    const total = await collection.count();
    const items = await collection
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    return { items, total };
  },
};

export default db;
