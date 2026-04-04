"use client";

import { ReloadIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import {
  formUrlQuery,
  removeKeysFromUrlQuery,
} from "@/lib/url";

import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface Props {
  initialValue?: string;
  searchMode?: "keyword" | "hybrid" | "none";
  hasKeywordQuery?: boolean;
}

const SemanticSearch = ({
  initialValue = "",
  searchMode = "none",
  hasKeywordQuery = false,
}: Props) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(Boolean(initialValue));
  const [semanticQuery, setSemanticQuery] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const queryValue = semanticQuery.trim();
    if (!queryValue) return;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("query");
    nextParams.delete("page");

    const newUrl = formUrlQuery({
      params: nextParams.toString(),
      key: "semanticQuery",
      value: queryValue,
    });

    startTransition(() => {
      router.push(newUrl, { scroll: false });
    });
  };

  const handleClose = () => {
    setIsOpen(false);
    setSemanticQuery("");

    const newUrl = removeKeysFromUrlQuery({
      params: searchParams.toString(),
      keysToRemove: ["semanticQuery", "page"],
    });

    startTransition(() => {
      router.push(newUrl, { scroll: false });
    });
  };

  return (
    <section className="mt-6">
      <Button
        type="button"
        variant="secondary"
        className="body-medium min-h-[46px] gap-2 rounded-lg px-4 py-3"
        onClick={() => setIsOpen((current) => !current)}
      >
        <Image
          src="/icons/stars.svg"
          alt="AI search"
          width={18}
          height={18}
        />
        {isOpen ? "Hide AI Related Search" : "AI Related Search"}
      </Button>

      {isOpen && (
        <div className="background-light800_darkgradient mt-4 rounded-[10px] p-4">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <div className="flex min-h-[56px] flex-1 items-center gap-4 rounded-[10px] bg-light-900 px-4 dark:bg-dark-300">
              <Image
                src="/icons/stars.svg"
                width={24}
                height={24}
                alt="AI related search"
              />

              <Input
                type="text"
                placeholder="Describe your issue to find related questions..."
                value={semanticQuery}
                onChange={(event) => setSemanticQuery(event.target.value)}
                className="paragraph-regular no-focus placeholder text-dark400_light700 border-none shadow-none outline-none"
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={isPending || !semanticQuery.trim()}
                className="primary-gradient min-h-[46px] px-6 py-3 !text-light-900"
              >
                {isPending ? (
                  <>
                    <ReloadIcon className="mr-2 size-4 animate-spin" />
                    Searching
                  </>
                ) : (
                  "Search"
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                className="min-h-[46px] px-6 py-3"
                onClick={handleClose}
              >
                Clear
              </Button>
            </div>
          </form>

          <p className="small-regular text-dark400_light700 mt-3">
            Direct search is still the primary search. Open this only when you
            want AI-related matching.
            {searchMode === "hybrid" &&
              !hasKeywordQuery &&
              " Showing AI-related matches."}
            {searchMode === "keyword" &&
              initialValue &&
              !hasKeywordQuery &&
              " AI search is unavailable here, so this is using keyword fallback."}
          </p>
        </div>
      )}
    </section>
  );
};

export default SemanticSearch;
