"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useTaskStore } from "@/lib/store";
import { Target, Plus, Trash2 } from "lucide-react";

export default function GoalsPage() {
  const { goals, addGoal, updateGoalProgress, deleteGoal } = useTaskStore();
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("12");

  const handleAdd = async () => {
    if (!title.trim() || !target) return;
    try {
      await addGoal({ title: title.trim(), progress: 0, target: Number(target), color: "#7c5cfc" });
      setTitle("");
      setTarget("12");
      setShowModal(false);
    } catch {
      // The provider displays the request error and keeps the form available.
    }
  };

  return (
    <DashboardLayout>
      <PageLayout
        title="Goals"
        description="Track your progress toward personal and professional goals."
        action={
          <Button size="sm" onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Goal
          </Button>
        }
      >
        <div className="grid gap-6 md:grid-cols-2">
          {goals.map((goal) => {
            const pct = Math.min(100, Math.round((goal.progress / goal.target) * 100));
            return (
              <Card key={goal.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" style={{ color: goal.color }} aria-hidden="true" />
                    {goal.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline justify-between mb-3">
                    <span className="text-3xl font-bold tabular-nums text-slate-900">
                      {goal.progress}<span className="text-lg text-slate-400">/{goal.target}</span>
                    </span>
                    <span className="text-sm font-medium text-slate-500">{pct}%</span>
                  </div>
                  <Progress value={pct} color={goal.color} className="h-2.5" />
                  <p className="text-xs text-slate-400 mt-2">
                    {goal.target - goal.progress > 0 ? `${goal.target - goal.progress} remaining` : "Goal reached 🎉"}
                  </p>
                  <div className="mt-4 flex justify-between">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={goal.progress >= goal.target}
                      onClick={() => { void updateGoalProgress(goal.id, Math.min(goal.target, goal.progress + 1)).catch(() => {}); }}
                    >
                      Add progress
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${goal.title}`}
                      onClick={() => {
                        if (confirm(`Delete the goal "${goal.title}"?`)) {
                          void deleteGoal(goal.id).catch(() => {});
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Modal open={showModal} onClose={() => setShowModal(false)} title="New Goal" description="Set a new target to work toward." size="sm">
          <div className="space-y-4">
            <Input label="Goal title" placeholder="e.g. Read 12 books" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <Input label="Target" type="number" min="1" value={target} onChange={(e) => setTarget(e.target.value)} />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={() => { void handleAdd(); }} disabled={!title.trim() || !Number.isSafeInteger(Number(target)) || Number(target) < 1}>Create Goal</Button>
            </div>
          </div>
        </Modal>
      </PageLayout>
    </DashboardLayout>
  );
}
