'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useReviewStore } from '@/store';
import { CheckCircle, MoreHorizontal, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';

interface BulkActionsProps {
  className?: string;
}

export function BulkActions({ className }: BulkActionsProps) {
  const {
    selectedIds,
    selectAllItems,
    clearSelection,
    bulkUpdateStatus,
    deleteItems,
    getFilteredItems,
  } = useReviewStore();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const filteredItems = getFilteredItems();
  const selectedCount = selectedIds.size;
  const allSelected = selectedCount === filteredItems.length && filteredItems.length > 0;

  const handleSelectAll = () => {
    if (allSelected) {
      clearSelection();
    } else {
      selectAllItems();
    }
  };

  const handleBulkApprove = () => {
    bulkUpdateStatus('approved');
  };

  const handleBulkReject = () => {
    bulkUpdateStatus('rejected');
  };

  const handleBulkDelete = () => {
    deleteItems(Array.from(selectedIds));
    setDeleteDialogOpen(false);
  };

  if (filteredItems.length === 0) return null;

  return (
    <div className={cn('flex items-center justify-between py-2', className)}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allSelected}
            onCheckedChange={handleSelectAll}
            aria-label="Select all"
          />
          <span className="text-sm text-muted-foreground">
            {selectedCount > 0
              ? `${selectedCount} of ${filteredItems.length} selected`
              : `${filteredItems.length} items`}
          </span>
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleBulkApprove}>
            <CheckCircle className="h-4 w-4 mr-1" />
            Approve ({selectedCount})
          </Button>
          <Button variant="outline" size="sm" onClick={handleBulkReject}>
            <XCircle className="h-4 w-4 mr-1" />
            Reject ({selectedCount})
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Bulk Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => bulkUpdateStatus('pending')}>
                Mark as Pending
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => bulkUpdateStatus('modified')}>
                Mark as Modified
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteDialogOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="sm" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedCount} items?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. These items will be permanently removed from your local
              database.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
