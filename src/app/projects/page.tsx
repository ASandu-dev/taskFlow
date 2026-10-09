"use client";

import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useTaskStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Folder, Plus, CheckCircle, CircleDashed, Pencil, Trash2 } from "lucide-react";
import type { Project } from "@/types";

const presetColors = ["#7c5cfc", "#22c55e", "#3b82f6", "#f59e0b", "#ec4899"];

export default function ProjectsPage() {
  const { projects, tasks, addProject, updateProject, deleteProject } = useTaskStore();
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(presetColors[0]);

  const projectStats = useMemo(
    () => projects.map((p) => {
      const projectTasks = tasks.filter((t) => t.projectId === p.id);
      return {
        project: p,
        total: projectTasks.length,
        done: projectTasks.filter((t) => t.status === "done").length,
      };
    }),
    [projects, tasks]
  );

  const handleSave = async () => {
    if (!name.trim()) return;
    try {
      if (editingProject) {
        await updateProject(editingProject.id, { name: name.trim(), color });
      } else {
        await addProject({ name: name.trim(), color });
      }
      setName("");
      setColor(presetColors[0]);
      setEditingProject(null);
      setShowModal(false);
    } catch {
      // The provider shows the request error and leaves the dialog open.
    }
  };

  const openCreate = () => {
    setEditingProject(null);
    setName("");
    setColor(presetColors[0]);
    setShowModal(true);
  };

  const openEdit = (project: Project) => {
    setEditingProject(project);
    setName(project.name);
    setColor(project.color);
    setShowModal(true);
  };

  return (
    <DashboardLayout>
      <PageLayout
        title="Projects"
        description="Organize your tasks into projects and track progress."
        action={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Project
          </Button>
        }
      >
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projectStats.map(({ project, total, done }) => {
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <Card key={project.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Folder className="h-5 w-5" style={{ color: project.color }} aria-hidden="true" />
                      <CardTitle className="text-base">{project.name}</CardTitle>
                    </div>
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: project.color } as React.CSSProperties}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(project)} aria-label={`Edit ${project.name}`}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${project.name}`}
                      onClick={() => {
                        if (confirm(`Delete "${project.name}"? Projects with tasks must have those tasks moved or deleted first.`)) {
                          void deleteProject(project.id).catch(() => {});
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-2xl font-bold tabular-nums text-slate-900">
                      {done}<span className="text-base text-slate-400">/{total}</span>
                    </span>
                    <span className="text-xs text-slate-500 font-medium">{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: project.color } as React.CSSProperties}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />{done} done
                    </span>
                    <span className="flex items-center gap-1">
                      <CircleDashed className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />{total - done} pending
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Modal open={showModal} onClose={() => setShowModal(false)} title={editingProject ? "Edit Project" : "New Project"} description="Organize your tasks into projects." size="sm">
          <div className="space-y-4">
            <Input label="Project name" placeholder="e.g. Personal" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Color</label>
              <div className="flex items-center gap-2 flex-wrap">
                {presetColors.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className={cn("h-9 w-9 rounded-xl border-2 transition-all", color === c ? "border-purple-500 scale-110" : "border-transparent hover:border-slate-300")}
                    style={{ backgroundColor: c } as React.CSSProperties}
                    aria-label={`Select ${c} color`} aria-pressed={color === c} />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={() => { void handleSave(); }} disabled={!name.trim()}>{editingProject ? "Save Changes" : "Create Project"}</Button>
            </div>
          </div>
        </Modal>
      </PageLayout>
    </DashboardLayout>
  );
}
