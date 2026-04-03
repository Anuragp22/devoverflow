"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { use, useEffect, useState } from "react";

import { toast } from "@/hooks/use-toast";
import { toggleSaveQuestion } from "@/lib/actions/collection.action";

const SaveQuestion = ({
  questionId,
  hasSavedQuestionPromise,
}: {
  questionId: string;
  hasSavedQuestionPromise: Promise<ActionResponse<{ saved: boolean }>>;
}) => {
  const session = useSession();
  const userId = session?.data?.user?.id;

  const { data } = use(hasSavedQuestionPromise);

  const { saved: hasSaved } = data || {};
  const [isSaved, setIsSaved] = useState(hasSaved || false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsSaved(hasSaved || false);
  }, [hasSaved]);

  const handleSave = async () => {
    if (isLoading) return;
    if (!userId)
      return toast({
        title: "You need to be logged in to save a question",
        variant: "destructive",
      });

    setIsLoading(true);
    const previousSaved = isSaved;
    setIsSaved((current) => !current);

    try {
      const { success, data, error } = await toggleSaveQuestion({
        questionId,
      });

      if (!success) throw new Error(error?.message || "An error occurred");

      setIsSaved(data?.saved || false);

      toast({
        title: `Question ${data?.saved ? "saved" : "unsaved"} successfully`,
      });
    } catch (error) {
      setIsSaved(previousSaved);

      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Image
      src={isSaved ? "/icons/star-filled.svg" : "/icons/star-red.svg"}
      width={18}
      height={18}
      alt="save"
      className={`cursor-pointer ${isLoading && "opacity-50"}`}
      aria-label="Save question"
      onClick={handleSave}
    />
  );
};

export default SaveQuestion;
