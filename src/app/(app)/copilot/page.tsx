"use client";
import { CopilotPanel } from "@/components/copilot";
export default function CopilotPage() {
  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-3xl flex-col">
      <CopilotPanel page="AI copilot page" />
    </div>
  );
}
