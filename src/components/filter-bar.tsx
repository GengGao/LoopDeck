"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useReviewStore } from "@/store";
import type { ReviewStatus } from "@/types/review";
import { Filter, Search, SortAsc, SortDesc, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface FilterBarProps {
  className?: string;
}

export function FilterBar({ className }: FilterBarProps) {
  const { filters, setFilters, resetFilters, stats, items } = useReviewStore();
  const [searchValue, setSearchValue] = useState(filters.search || "");
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  // Get unique models from items
  const models = [
    ...new Set(items.flatMap((item) => item.outputs.map((o) => o.model_id))),
  ];

  // Update search filter with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setFilters({ search: searchValue });
    }, 300); // 300ms debounce

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchValue, setFilters]);

  // Sync local search value with store filters
  // biome-ignore lint:correctness/useExhaustiveDependencies
  useEffect(() => {
    if (filters.search !== searchValue) {
      setSearchValue(filters.search || "");
    }
  }, [filters.search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Immediate update on submit
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    setFilters({ search: searchValue });
  };

  const handleSearchClear = () => {
    setSearchValue("");
    setFilters({ search: "" });
  };

  const handleStatusChange = (status: string) => {
    setFilters({ status: status as ReviewStatus | "all" });
  };

  const handleSortChange = (sortBy: string) => {
    setFilters({ sortBy: sortBy as "created_at" | "updated_at" | "status" });
  };

  const toggleSortOrder = () => {
    setFilters({ sortOrder: filters.sortOrder === "asc" ? "desc" : "asc" });
  };

  const hasActiveFilters =
    filters.status !== "all" ||
    filters.search ||
    filters.modelId ||
    (filters.tags && filters.tags.length > 0);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Search */}
      <form onSubmit={handleSearchSubmit} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search prompts and responses..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchValue && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
            onClick={handleSearchClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </form>

      {/* Status Filter Pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={filters.status === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => handleStatusChange("all")}
          className="h-7"
        >
          All
          <Badge variant="secondary" className="ml-1.5 text-xs px-1.5">
            {stats.total}
          </Badge>
        </Button>
        <Button
          variant={filters.status === "pending" ? "default" : "outline"}
          size="sm"
          onClick={() => handleStatusChange("pending")}
          className="h-7"
        >
          Pending
          <Badge variant="secondary" className="ml-1.5 text-xs px-1.5">
            {stats.pending}
          </Badge>
        </Button>
        <Button
          variant={filters.status === "approved" ? "default" : "outline"}
          size="sm"
          onClick={() => handleStatusChange("approved")}
          className="h-7"
        >
          Approved
          <Badge variant="secondary" className="ml-1.5 text-xs px-1.5">
            {stats.approved}
          </Badge>
        </Button>
        <Button
          variant={filters.status === "modified" ? "default" : "outline"}
          size="sm"
          onClick={() => handleStatusChange("modified")}
          className="h-7"
        >
          Modified
          <Badge variant="secondary" className="ml-1.5 text-xs px-1.5">
            {stats.modified}
          </Badge>
        </Button>
        <Button
          variant={filters.status === "rejected" ? "default" : "outline"}
          size="sm"
          onClick={() => handleStatusChange("rejected")}
          className="h-7"
        >
          Rejected
          <Badge variant="secondary" className="ml-1.5 text-xs px-1.5">
            {stats.rejected}
          </Badge>
        </Button>
      </div>

      {/* Advanced Filters */}
      <div className="flex items-center gap-2">
        {/* Model Filter */}
        {models.length > 1 && (
          <Select
            value={filters.modelId || "all"}
            onValueChange={(value) =>
              setFilters({ modelId: value === "all" ? undefined : value })
            }
          >
            <SelectTrigger className="w-[150px] h-8">
              <SelectValue placeholder="All models" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All models</SelectItem>
              {models.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <Filter className="h-3 w-3 mr-1" />
              Sort
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => handleSortChange("created_at")}
              className={cn(filters.sortBy === "created_at" && "bg-accent")}
            >
              Created Date
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleSortChange("updated_at")}
              className={cn(filters.sortBy === "updated_at" && "bg-accent")}
            >
              Updated Date
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleSortChange("status")}
              className={cn(filters.sortBy === "status" && "bg-accent")}
            >
              Status
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sort Order Toggle */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={toggleSortOrder}
        >
          {filters.sortOrder === "asc" ? (
            <SortAsc className="h-4 w-4" />
          ) : (
            <SortDesc className="h-4 w-4" />
          )}
        </Button>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={resetFilters}
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
