"use client";

import { useState, useMemo, useEffect } from "react";
import type { Task } from "@/types";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskModal } from "@/components/tasks/TaskModal";
import { Button } from "@/components/ui/Button";
import { useTaskStore } from "@/lib/store";
import { getDateKey } from "@/lib/utils";
import { Sun, Plus } from "lucide-react";

export default function TodayPage() {
  const { tasks, toggleTask, deleteTask, addTask, updateTask } = useTaskStore();
  // SSR-safe: resolve the today-key after mount so the prerendered HTML
  // does not depend on `new Date()`.
  const [todayStr, setTodayStr] = useState<string>("2026-10-08");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTodayStr(getDateKey(new Date()));
  }, []);

  const todayTasks = useMemo(
    () => tasks.filter((t) => t.date === todayStr),
    [tasks, todayStr]
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const handleSubmit = async (data: Omit<Task, "id" | "createdAt">) => {
    if (editingTask) await updateTask(editingTask.id, data);
    else await addTask(data);
    setModalOpen(false);
    setEditingTask(null);
  };

  return (
    <DashboardLayout>
      <PageLayout
        title="Today"
        description={`${todayTasks.length} task${todayTasks.length !== 1 ? "s" : ""} scheduled for today.`}
        action={
          <Button size="sm" onClick={() => { setEditingTask(null); setModalOpen(true); }}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Task
          </Button>
        }
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Sun className="h-5 w-5 text-orange-500" aria-hidden="true" />
              Today&#39;s Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TaskList
              tasks={todayTasks}
              onToggle={(id) => { void toggleTask(id).catch(() => {}); }}
              onEdit={(task: Task) => { setEditingTask(task); setModalOpen(true); }}
              onDelete={(id) => {
                if (confirm("Delete this task?")) void deleteTask(id).catch(() => {});
              }}
              emptyMessage="No tasks for today — enjoy your free day"
            />
          </CardContent>
        </Card>

        <TaskModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditingTask(null); }}
          onSubmit={handleSubmit}
          initialTask={editingTask}
          defaultDate={todayStr}
        />
      </PageLayout>
    </DashboardLayout>
  );
}
