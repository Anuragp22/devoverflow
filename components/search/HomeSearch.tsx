"use client";

import { ReloadIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";

import { formUrlQuery, removeKeysFromUrlQuery } from "@/lib/url";
import { cn } from "@/lib/utils";

import { Button } from "../ui/button";
import { Input } from "../ui/input";

const HomeSearch = () => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("query") || "";
  const semanticQuery = searchParams.get("semanticQuery") || "";

  const [isAiMode, setIsAiMode] = useState(Boolean(semanticQuery));
  const [searchValue, setSearchValue] = useState(semanticQuery || query);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setIsAiMode(Boolean(semanticQuery));
    setSearchValue(semanticQuery || query);
  }, [query, semanticQuery]);

  useEffect(() => {
    if (isAiMode) return;

    const debounceId = setTimeout(() => {
      if (searchValue === query) return;

      if (searchValue) {
        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.delete("semanticQuery");
        nextParams.delete("page");

        const nextUrl = formUrlQuery({
          params: nextParams.toString(),
          key: "query",
          value: searchValue,
        });

        router.push(nextUrl, { scroll: false });
        return;
      }

      if (pathname === "/") {
        const nextUrl = removeKeysFromUrlQuery({
          params: searchParams.toString(),
          keysToRemove: ["query", "page"],
        });

        router.push(nextUrl, { scroll: false });
      }
    }, 300);

    return () => clearTimeout(debounceId);
  }, [isAiMode, pathname, query, router, searchParams, searchValue]);

  const handleAiSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextValue = searchValue.trim();
    if (!nextValue) return;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("query");
    nextParams.delete("page");

    const nextUrl = formUrlQuery({
      params: nextParams.toString(),
      key: "semanticQuery",
      value: nextValue,
    });

    startTransition(() => {
      router.push(nextUrl, { scroll: false });
    });
  };

  const handleToggleMode = () => {
    setIsAiMode((current) => !current);
  };

  return (
    <form
      onSubmit={handleAiSearch}
      className={cn(
        "flex min-h-[56px] grow items-center gap-3 rounded-[14px] px-4 transition-all duration-500",
        isAiMode
          ? "border border-primary-500/40 bg-light-900 shadow-[0_0_24px_rgba(255,112,0,0.25)] dark:bg-dark-300"
          : "background-light800_darkgradient"
      )}
    >
      <Image
        src={isAiMode ? "/icons/stars.svg" : "/icons/search.svg"}
        width={24}
        height={24}
        alt={isAiMode ? "AI search" : "Search"}
        className={cn("transition-transform duration-500", isAiMode && "animate-pulse")}
      />

      <Input
        type="text"
        placeholder={
          isAiMode
            ? "Ask in natural language to find related questions..."
            : "Search questions..."
        }
        value={searchValue}
        onChange={(event) => setSearchValue(event.target.value)}
        className="paragraph-regular no-focus placeholder text-dark400_light700 border-none shadow-none outline-none"
      />

      {isAiMode && (
        <Button
          type="submit"
          disabled={isPending || !searchValue.trim()}
          className="primary-gradient min-h-[40px] px-4 py-2 !text-light-900"
        >
          {isPending ? <ReloadIcon className="size-4 animate-spin" /> : "Search"}
        </Button>
      )}

      <Button
        type="button"
        onClick={handleToggleMode}
        variant="secondary"
        className={cn(
          "min-h-[40px] rounded-full px-3 transition-all duration-500",
          isAiMode && "bg-primary-100 text-primary-500"
        )}
        aria-label={isAiMode ? "Switch to normal search" : "Switch to AI search"}
      >
        <Image
          src="/icons/stars.svg"
          width={16}
          height={16}
          alt="AI mode"
          className={cn(isAiMode && "animate-spin")}
        />
        <span className="small-semibold ml-1">{isAiMode ? "AI" : ""}</span>
      </Button>
    </form>
  );
};

export default HomeSearch;
