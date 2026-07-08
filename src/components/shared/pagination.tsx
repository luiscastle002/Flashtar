"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  basePath: string;
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  basePath,
}: PaginationProps) {
  const t = useTranslations("common");
  const totalPages = Math.ceil(totalItems / pageSize);

  // If there's only 1 page or no items, hide pagination
  if (totalPages <= 1 || totalItems === 0) {
    return null;
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Helper to generate correct href with query param
  const getPageHref = (pageNumber: number) => {
    const separator = basePath.includes("?") ? "&" : "?";
    return `${basePath}${separator}page=${pageNumber}`;
  };

  // Generate page numbers array (simple list or range with ellipsis)
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always include page 1
      pages.push(1);
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      if (start > 2) {
        pages.push("ellipsis-start");
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (end < totalPages - 1) {
        pages.push("ellipsis-end");
      }
      
      // Always include last page
      pages.push(totalPages);
    }
    
    return pages;
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4 mt-8 py-4 border-t border-border/40 w-full">
      {/* Pagination Controls */}
      <nav aria-label="Pagination Navigation" className="flex items-center gap-1.5 flex-wrap justify-center">
        {/* Previous Button */}
        {currentPage === 1 ? (
          <span
            className={`${buttonVariants({
              variant: "outline",
              size: "default",
            })} pointer-events-none opacity-50 select-none flex items-center gap-1`}
          >
            <ChevronLeft className="h-4 w-4" />
            <span>{t("pagination.previous")}</span>
          </span>
        ) : (
          <Link
            href={getPageHref(currentPage - 1)}
            className={`${buttonVariants({
              variant: "outline",
              size: "default",
            })} flex items-center gap-1 hover:bg-accent hover:text-accent-foreground transition-all duration-200`}
          >
            <ChevronLeft className="h-4 w-4" />
            <span>{t("pagination.previous")}</span>
          </Link>
        )}

        {/* Numbered Buttons */}
        {getPageNumbers().map((page, index) => {
          if (typeof page === "string") {
            return (
              <span
                key={`ellipsis-${index}`}
                className="px-3 py-2 text-sm text-muted-foreground select-none"
              >
                &hellip;
              </span>
            );
          }

          const isCurrent = page === currentPage;

          return (
            <Link
              key={page}
              href={getPageHref(page)}
              aria-current={isCurrent ? "page" : undefined}
              className={`${buttonVariants({
                variant: isCurrent ? "default" : "outline",
                size: "icon",
              })} w-10 h-10 transition-all duration-200 ${
                isCurrent 
                  ? "shadow-sm shadow-primary/20" 
                  : "hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {page}
            </Link>
          );
        })}

        {/* Next Button */}
        {currentPage === totalPages ? (
          <span
            className={`${buttonVariants({
              variant: "outline",
              size: "default",
            })} pointer-events-none opacity-50 select-none flex items-center gap-1`}
          >
            <span>{t("pagination.next")}</span>
            <ChevronRight className="h-4 w-4" />
          </span>
        ) : (
          <Link
            href={getPageHref(currentPage + 1)}
            className={`${buttonVariants({
              variant: "outline",
              size: "default",
            })} flex items-center gap-1 hover:bg-accent hover:text-accent-foreground transition-all duration-200`}
          >
            <span>{t("pagination.next")}</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </nav>

      {/* Showing item range text */}
      <span className="text-xs text-muted-foreground font-medium">
        {t("pagination.showing", {
          start: startItem,
          end: endItem,
          total: totalItems,
        })}
      </span>
    </div>
  );
}
