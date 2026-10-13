"use client";

import { useState } from "react";
import type { Priority } from "@/types";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useTaskStore } from "@/lib/store";
import { Copy } from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string;
  tasks: { title: string; priority: Priority; time?: string }[];
  icon: string;
}

const templates: Template[] = [
  { id: "1", name: "Morning Routine", description: "Start your day with intention", icon: "☀️", tasks: [
    { title: "Meditate", priority: "low" },
    { title: "Review today's priorities", priority: "medium" },
    { title: "Exercise", priority: "medium" },
  ]},
  { id: "2", name: "Deep Work Block", description: "2 hours of uninterrupted focus", icon: "🎯", tasks: [
    { title: "Turn on focus timer", priority: "high" },
    { title: "Work on main project", priority: "high" },
    { title: "Take a short break", priority: "low" },
  ]},
  { id: "3", name: "Weekly Review", description: "Reflect and plan the week ahead", icon: "📅", tasks: [
    { title: "Review completed tasks", priority: "medium" },
    { title: "Plan next week", priority: "high" },
    { title: "Set new goals", priority: "medium" },
  ]},
  { id: "4", name: "Content Creation", description: "Plan, write, and publish", icon: "✍️", tasks: [
    { title: "Research topic", priority: "medium" },
    { title: "Write draft", priority: "high" },
    { title: "Edit and publish", priority: "medium" },
  ]},
];

export default function TemplatesPage() {
  const { addTask } = useTaskStore();
  const [selected, setSelected] = useState<string | null>(null);

  const handleUseTemplate = async (template: Template) => {
    try {
      await Promise.all(template.tasks.map((t) =>
        addTask({
        title: t.title,
        projectId: "1",
        priority: t.priority,
        status: "todo",
        time: t.time,
        date: undefined,
        })
      ));
      setSelected(template.id);
      setTimeout(() => setSelected(null), 2000);
    } catch {
      // The provider displays the request error; don't claim the template succeeded.
    }
  };

  return (
    <DashboardLayout>
      <PageLayout
        title="Templates"
        description="Reusable task sequences to kickstart your workflow."
      >
        <div className="grid gap-6 md:grid-cols-2">
          {templates.map((template) => (
            <Card key={template.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden="true">{template.icon}</span>
                  {template.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-500 mb-3">{template.description}</p>
                <div className="space-y-1.5 mb-4">
                  {template.tasks.map((t) => (
                    <div key={t.title} className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-400" aria-hidden="true" />
                      {t.title}
                      <span className="text-xs text-slate-500 capitalize">· {t.priority}</span>
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={() => handleUseTemplate(template)}
                  className={selected === template.id ? "bg-green-600 hover:bg-green-700" : ""}
                >
                  {selected === template.id ? (
                    <>Added ✓</>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1.5" aria-hidden="true" />
                      Use Template
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </PageLayout>
    </DashboardLayout>
  );
}
