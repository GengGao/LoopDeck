'use client';

import { useState } from 'react';
import {
  Moon,
  Sun,
  Download,
  Upload,
  Trash2,
  HelpCircle,
  Settings,
  Keyboard,
  Github,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useReviewStore } from '@/store';
import { Button } from '@/components/ui/button';
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
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const { stats, exportItems, exportForTraining, clearAllData } = useReviewStore();
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  const handleClearAll = () => {
    clearAllData();
    setClearDialogOpen(false);
  };

  return (
    <header className={cn('border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60', className)}>
      <div className="flex h-14 items-center justify-between px-4">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
            L
          </div>
          <span className="font-semibold text-lg">LoopDeck</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">v0.1.0</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Export Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Export Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => exportItems()}
                disabled={stats.approved + stats.modified === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export Approved ({stats.approved + stats.modified})
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => exportForTraining()}
                disabled={stats.approved + stats.modified === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export for Training
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportItems({ includeMetadata: true })}>
                <Download className="h-4 w-4 mr-2" />
                Export All with Metadata
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Settings Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Settings</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setHelpDialogOpen(true)}>
                <Keyboard className="h-4 w-4 mr-2" />
                Keyboard Shortcuts
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="https://github.com/your-repo/loopdeck" target="_blank" rel="noopener noreferrer">
                  <Github className="h-4 w-4 mr-2" />
                  GitHub
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setClearDialogOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All Data
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          {/* Help */}
          <Button variant="ghost" size="icon" onClick={() => setHelpDialogOpen(true)}>
            <HelpCircle className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Clear Data Dialog */}
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all data?</DialogTitle>
            <DialogDescription>
              This will permanently delete all {stats.total} review items from your local database.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClearAll}>
              Clear All Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Help/Keyboard Shortcuts Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
            <DialogDescription>
              Speed up your workflow with these shortcuts
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Review Actions</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vote for model 1, 2, 3</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs">1</kbd>
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs">2</kbd>
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs">3</kbd>
                </div>
              </div>
            </div>
            <Separator />
            <div>
              <h4 className="font-medium mb-2">Navigation</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Navigate items/chunks</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs">Tab</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Move focus up/down</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs">↑</kbd>
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs">↓</kbd>
                </div>
              </div>
            </div>
            <Separator />
            <div>
              <h4 className="font-medium mb-2">Export</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Export dialog</span>
                  <span className="flex gap-1">
                    <kbd className="px-2 py-0.5 bg-muted rounded text-xs">Ctrl</kbd>
                    <kbd className="px-2 py-0.5 bg-muted rounded text-xs">Shift</kbd>
                    <kbd className="px-2 py-0.5 bg-muted rounded text-xs">E</kbd>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
