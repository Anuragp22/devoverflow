"use client";

import Image from "next/image";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import ROUTES from "@/constants/routes";

// Define search result categories
interface SearchResult {
  title: string;
  route: string;
  icon?: string;
}

interface SearchCategory {
  category: string;
  items: SearchResult[];
}

const GlobalSearch = () => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchCategory[]>([]);
  const [activeResult, setActiveResult] = useState({ category: 0, item: 0 });
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  // Mock search results
  const getSearchResults = (query: string): SearchCategory[] => {
    if (!query || query.trim() === "") return [];

    // In a real implementation, this would fetch data from an API
    // For now, we'll just return some mock data based on the query
    const lowerCaseQuery = query.toLowerCase();

    return [
      {
        category: "Questions",
        items: [
          {
            title: `How to use ${query} in JavaScript?`,
            route: `${ROUTES.HOME}?query=${encodeURIComponent(query)}`,
            icon: "/icons/search.svg",
          },
          {
            title: `Understanding ${query} in programming`,
            route: `${ROUTES.HOME}?query=${encodeURIComponent(query)}`,
            icon: "/icons/search.svg",
          },
        ],
      },
      {
        category: "Tags",
        items: [
          {
            title: `${query} tag`,
            route: `${ROUTES.TAGS}?query=${encodeURIComponent(query)}`,
            icon: "/icons/tag.svg",
          },
        ],
      },
      {
        category: "Users",
        items: [
          {
            title: `Users with ${query} expertise`,
            route: `${ROUTES.COMMUNITY}?query=${encodeURIComponent(query)}`,
            icon: "/icons/user.svg",
          },
        ],
      },
    ];
  };

  // Handle search input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (query.trim().length > 0) {
      const results = getSearchResults(query);
      setSearchResults(results);
      setActiveResult({ category: 0, item: 0 }); // Reset navigation when results change
    } else {
      setSearchResults([]);
    }
  };

  // Handle search result click
  const handleSelectResult = (route: string) => {
    router.push(route);
    setIsOpen(false);
    setIsMobileSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  // Get the currently active result
  const getActiveResult = () => {
    if (
      searchResults.length > 0 &&
      searchResults[activeResult.category] &&
      searchResults[activeResult.category].items[activeResult.item]
    ) {
      return searchResults[activeResult.category].items[activeResult.item];
    }
    return null;
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchResults.length) return;

    // Navigate through results with arrow keys
    if (e.key === "ArrowDown") {
      e.preventDefault();

      const currentCategory = searchResults[activeResult.category];
      if (activeResult.item < currentCategory.items.length - 1) {
        // Move to next item in same category
        setActiveResult((prev) => ({ ...prev, item: prev.item + 1 }));
      } else if (activeResult.category < searchResults.length - 1) {
        // Move to first item in next category
        setActiveResult({ category: activeResult.category + 1, item: 0 });
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();

      if (activeResult.item > 0) {
        // Move to previous item in same category
        setActiveResult((prev) => ({ ...prev, item: prev.item - 1 }));
      } else if (activeResult.category > 0) {
        // Move to last item in previous category
        const prevCategory = searchResults[activeResult.category - 1];
        setActiveResult({
          category: activeResult.category - 1,
          item: prevCategory.items.length - 1,
        });
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const result = getActiveResult();
      if (result) {
        handleSelectResult(result.route);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setIsMobileSearchOpen(false);
    }
  };

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Focus the input when mobile search is opened
  useEffect(() => {
    if (isMobileSearchOpen && mobileInputRef.current) {
      setTimeout(() => {
        mobileInputRef.current?.focus();
      }, 100);
    }
  }, [isMobileSearchOpen]);

  // Desktop search component
  const DesktopSearch = () => (
    <div
      className="relative w-full max-w-[600px] max-lg:hidden"
      ref={searchRef}
    >
      <div className="background-light800_darkgradient relative flex min-h-[56px] grow items-center gap-1 rounded-xl px-4">
        <Image
          src="/icons/search.svg"
          alt="search"
          width={24}
          height={24}
          className="cursor-pointer"
        />

        <Input
          ref={inputRef}
          type="text"
          placeholder="Search globally"
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          className="paragraph-regular no-focus placeholder text-dark400_light700 border-none bg-transparent shadow-none outline-none"
        />
      </div>

      {/* Search Results Dropdown for Desktop */}
      {isOpen && searchResults.length > 0 && (
        <div className="absolute mt-2 w-full rounded-xl border bg-light-900 py-5 shadow-sm dark:bg-dark-200">
          {searchResults.map((category, categoryIndex) => (
            <div key={categoryIndex} className="mb-5">
              <h3 className="paragraph-semibold text-dark200_light900 px-5 mb-2">
                {category.category}
              </h3>
              <hr className="border-t border-light-700 dark:border-dark-500 mb-2" />

              {category.items.map((item, itemIndex) => (
                <div
                  key={itemIndex}
                  className={`flex cursor-pointer items-center px-5 py-2.5 hover:bg-light-800 dark:hover:bg-dark-400 ${
                    activeResult.category === categoryIndex &&
                    activeResult.item === itemIndex
                      ? "bg-light-800 dark:bg-dark-400"
                      : ""
                  }`}
                  onClick={() => handleSelectResult(item.route)}
                >
                  {item.icon && (
                    <Image
                      src={item.icon}
                      alt={category.category}
                      width={18}
                      height={18}
                      className="mr-2"
                    />
                  )}
                  <p className="body-medium text-dark200_light900">
                    {item.title}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Mobile search trigger
  const MobileSearchTrigger = () => (
    <Button
      className="background-light800_darkgradient hidden max-lg:flex gap-2 rounded-lg px-4 py-2"
      onClick={() => setIsMobileSearchOpen(true)}
    >
      <Image src="/icons/search.svg" alt="search" width={16} height={16} />
      <p className="text-dark400_light700 max-sm:hidden">Search</p>
    </Button>
  );

  // Mobile search dialog content
  const MobileSearchContent = () => (
    <div className="background-light900_dark200 relative mt-4 w-full rounded-lg p-4">
      <div className="background-light800_darkgradient flex min-h-[56px] grow items-center gap-1 rounded-lg px-4">
        <Image src="/icons/search.svg" alt="search" width={24} height={24} />
        <Input
          ref={mobileInputRef}
          type="text"
          placeholder="Search globally"
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="paragraph-regular no-focus placeholder text-dark400_light700 border-none bg-transparent shadow-none outline-none"
        />
      </div>

      {/* Search Results for Mobile */}
      {searchResults.length > 0 && (
        <div className="mt-4 rounded-lg border border-light-700 bg-light-800 dark:border-dark-400 dark:bg-dark-300">
          {searchResults.map((category, categoryIndex) => (
            <div key={categoryIndex} className="mb-5">
              <h3 className="paragraph-semibold text-dark200_light900 px-4 pt-4 mb-2">
                {category.category}
              </h3>
              <hr className="border-t border-light-700 dark:border-dark-500 mb-2" />

              {category.items.map((item, itemIndex) => (
                <div
                  key={itemIndex}
                  className={`flex cursor-pointer items-center px-4 py-2.5 hover:bg-light-700 dark:hover:bg-dark-400 ${
                    activeResult.category === categoryIndex &&
                    activeResult.item === itemIndex
                      ? "bg-light-700 dark:bg-dark-500"
                      : ""
                  }`}
                  onClick={() => handleSelectResult(item.route)}
                >
                  {item.icon && (
                    <Image
                      src={item.icon}
                      alt={category.category}
                      width={18}
                      height={18}
                      className="mr-2"
                    />
                  )}
                  <p className="body-medium text-dark200_light900">
                    {item.title}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <DesktopSearch />

      {/* Mobile Search Dialog */}
      <Dialog open={isMobileSearchOpen} onOpenChange={setIsMobileSearchOpen}>
        <DialogTrigger asChild>
          <div className="hidden max-lg:block">
            <MobileSearchTrigger />
          </div>
        </DialogTrigger>
        <DialogContent className="background-light900_dark200 max-w-[90vw] rounded-lg border-0 p-0">
          <MobileSearchContent />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default GlobalSearch;
