"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { initializeCourse } from "@/actions/courses";
import { toast } from "sonner";
import { Loader2, ArrowRight } from "lucide-react";

export function CourseEnrollButton({ sharedDeckId }: { sharedDeckId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const t = useTranslations("courses");

  const handleEnroll = async () => {
    setLoading(true);
    try {
      const res = await initializeCourse(sharedDeckId);
      if (res.error) {
        toast.error("Failed to enroll: " + res.error);
      } else if (res.data?.studyDeckId) {
        toast.success("Enrolled successfully!");
        router.push(`/study/courses/${res.data.studyDeckId}`);
      }
    } catch (err) {
      console.error(err);
      toast.error("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleEnroll}
      disabled={loading}
      className="group"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
      ) : null}
      {t("actions.start_learning")}
      {!loading && (
        <ArrowRight className="h-3.5 w-3.5 ml-1.5 transition-transform group-hover:translate-x-1" />
      )}
    </Button>
  );
}
