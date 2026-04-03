"use client";

import { ReloadIcon } from "@radix-ui/react-icons";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import ROUTES from "@/constants/routes";
import { toast } from "@/hooks/use-toast";
import { deleteQuestion } from "@/lib/actions/question.action";

import { Button } from "../ui/button";

interface Props {
  questionId: string;
}

const DeleteQuestion = ({ questionId }: Props) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    const shouldDelete = window.confirm(
      "Delete this question and all of its answers, votes, and saved references?"
    );

    if (!shouldDelete) return;

    startTransition(async () => {
      const result = await deleteQuestion({ questionId });

      if (!result.success) {
        toast({
          title: `Error ${result.status}`,
          description:
            result.error?.message || "Failed to delete this question.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Question deleted",
        description: "The question and all related data were removed.",
      });

      router.push(ROUTES.HOME);
      router.refresh();
    });
  };

  return (
    <Button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      variant="destructive"
      className="min-h-[40px] gap-2 px-4 py-2"
    >
      {isPending ? (
        <ReloadIcon className="size-4 animate-spin" />
      ) : (
        <Trash2 className="size-4" />
      )}
      <span>Delete</span>
    </Button>
  );
};

export default DeleteQuestion;
