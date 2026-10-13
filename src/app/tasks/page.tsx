"use client";

import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskModal } from "@/components/tasks/TaskModal";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useTaskStore } from "@/lib/store";
import { Search, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";

type FilterType = "all" | "todo" | "done";

export default function TasksPage() {
  const { tasks, toggleTask, deleteTask, addTask, updateTask } = useTaskStore();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const filteredTasks = useMemo(() => {
    let result = [...tasks];
    if (filter === "todo") result = result.filter((t) => t.status === "todo");
    if (filter === "done") result = result.filter((t) => t.status === "done");
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) => t.title.toLowerCase().includes(q));
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [tasks, filter, search]);

  const counts = useMemo(() => ({
    all: tasks.length,
    todo: tasks.filter((t) => t.status === "todo").length,
    done: tasks.filter((t) => t.status === "done").length,
  }), [tasks]);

  const handleEdit = (task: Task) => { setEditingTask(task); setTaskModalOpen(true); };
  const handleAdd = () => { setEditingTask(null); setTaskModalOpen(true); };
  const handleSubmit = async (data: Omit<Task, "id" | "createdAt">) => {
    if (editingTask) await updateTask(editingTask.id, data);
    else await addTask(data);
    setTaskModalOpen(false);
    setEditingTask(null);
  };
  const handleDelete = async (id: string) => {
    await deleteTask(id);
    setDeleteConfirm(null);
  };

  return (
    <DashboardLayout>
      <PageLayout
        title="My Tasks"
        description="Manage and organize all your tasks across projects."
        action={
          <Button onClick={handleAdd} size="sm">
            <CalendarIcon className="h-4 w-4" aria-hidden="true" />
            Add Task
          </Button>
        }
      >
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
                <Input
                  type="search"
                  placeholder="Search tasks..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                  aria-label="Search tasks"
                />
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                {(["all", "todo", "done"] as FilterType[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
                      filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                    aria-pressed={filter === f}
                  >
                    {f === "all" ? "All" : f === "todo" ? "Pending" : "Done"} ({counts[f]})
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <TaskList
              tasks={filteredTasks}
              onToggle={(id) => { void toggleTask(id).catch(() => {}); }}
              onEdit={handleEdit}
              onDelete={(id) => setDeleteConfirm(id)}
              emptyMessage={search ? "No tasks match your search" : "No tasks yet — create your first task"}
            />
          </CardContent>
        </Card>

        <TaskModal
          open={taskModalOpen}
          onClose={() => { setTaskModalOpen(false); setEditingTask(null); }}
          onSubmit={handleSubmit}
          initialTask={editingTask}
        />

        <Modal
          open={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          title="Delete task"
          description="Are you sure you want to delete this task? This action cannot be undone."
          size="sm"
        >
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50"             onClick={() => { if (deleteConfirm) void handleDelete(deleteConfirm).catch(() => {}); }}>Delete</Button>
          </div>
        </Modal>
      </PageLayout>
    </DashboardLayout>
  );
}
