"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  CircleDashed,
  Target,
  Plus,
  ChevronDown,
  Folder,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/stats/StatCard";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskModal } from "@/components/tasks/TaskModal";
import { Calendar as CalendarComp } from "@/components/calendar/Calendar";
import { UpcomingList } from "@/components/calendar/UpcomingList";
import { ProductivityChart, TimeRangeSelector } from "@/components/charts/ProductivityChart";
import { QuickActions, defaultQuickActions } from "@/components/actions/QuickActions";
import { FocusTimer } from "@/components/focus/FocusTimer";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useTaskStore } from "@/lib/store";
import {
  getTasksForDate,
  getDateKey,
  getPriorityColor,
} from "@/lib/utils";
import type { Task, CalendarEvent, TimeRange } from "@/types";

type SortOption = "time" | "priority" | "created";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "time", label: "By time" },
  { value: "priority", label: "By priority" },
  { value: "created", label: "By created" },
];

export default function DashboardPage() {
  const router = useRouter();
  const { tasks, projects, toggleTask, deleteTask, addTask, updateTask, addProject, events: upcomingEvents, goals } = useTaskStore();
  const [todayStr, setTodayStr] = useState("");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Today tasks filtered by search
  const todayTasks = useMemo(() => {
    const today = getTasksForDate(tasks, todayStr);
    if (!searchQuery.trim()) return today;
    const query = searchQuery.toLowerCase();
    return today.filter((t) => t.title.toLowerCase().includes(query));
  }, [tasks, searchQuery, todayStr]);

  // Stats computed from store
  const completedCount = useMemo(
    () => tasks.filter((t) => t.status === "done" && t.date === todayStr).length,
    [tasks, todayStr]
  );
  const remainingCount = useMemo(
    () => tasks.filter((t) => t.status === "todo" && t.date === todayStr).length,
    [tasks, todayStr]
  );

  // Sort state
  const [sortBy, setSortBy] = useState<SortOption>("time");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  // Sorted today tasks
  const sortedTodayTasks = useMemo(() => {
    const sorted = [...todayTasks];
    switch (sortBy) {
      case "time":
        return sorted.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      case "priority": {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return sorted.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
      }
      case "created":
        return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }, [todayTasks, sortBy]);

  // Calendar selected date
  const [selectedDate, setSelectedDate] = useState("");

  useEffect(() => {
    const currentDate = getDateKey(new Date());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTodayStr(currentDate);
    setSelectedDate(currentDate);
  }, []);

  // Tasks and calendar events are both loaded from the database.
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    tasks.forEach((task) => {
      if (task.date) {
        const key = task.date;
        if (!map[key]) map[key] = [];
        map[key].push({
          id: `task-${task.id}`,
          title: task.title,
          date: task.date,
          time: task.time || "00:00",
          color: getPriorityColor(task.priority),
        });
      }
    });
    upcomingEvents.forEach((event) => {
      const key = event.date;
      if (!map[key]) map[key] = [];
      map[key].push(event);
    });
    return map;
  }, [tasks, upcomingEvents]);

  // Productivity chart state
  const [timeRange, setTimeRange] = useState<TimeRange>("this-week");
  const chartLabels = timeRange === "this-month"
    ? ["W1", "W2", "W3", "W4", "W5"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const chartData = useMemo(() => {
    const values = Array(chartLabels.length).fill(0) as number[];
    if (!todayStr) return values;
    const today = new Date(`${todayStr}T12:00:00`);

    for (const task of tasks) {
      if (task.status !== "done" || !task.date) continue;
      const taskDate = new Date(`${task.date}T12:00:00`);
      if (Number.isNaN(taskDate.getTime())) continue;

      if (timeRange === "this-month") {
        if (taskDate.getFullYear() === today.getFullYear() && taskDate.getMonth() === today.getMonth()) {
          values[Math.floor((taskDate.getDate() - 1) / 7)] += 1;
        }
        continue;
      }

      const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const daysSinceMonday = (weekStart.getDay() + 6) % 7;
      weekStart.setDate(weekStart.getDate() - daysSinceMonday - (timeRange === "last-week" ? 7 : 0));
      const dayOffset = Math.floor((taskDate.getTime() - weekStart.getTime()) / 86_400_000);
      if (dayOffset >= 0 && dayOffset < values.length) values[dayOffset] += 1;
    }

    return values;
  }, [chartLabels.length, tasks, timeRange, todayStr]);
  const goalProgress = goals.length
    ? Math.round(goals.reduce((sum, goal) => sum + goal.progress / goal.target, 0) / goals.length * 100)
    : 0;

  // Modals
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [focusTimerOpen, setFocusTimerOpen] = useState(false);
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState("#7c5cfc");

  // Preset colors for new project
  const presetColors = ["#7c5cfc", "#22c55e", "#3b82f6", "#f59e0b", "#ec4899"];

  // Keyboard shortcut for search (⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "/" && document.activeElement === document.body) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handle search change from Header
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  // Task handlers
  const handleAddTask = useCallback(() => {
    setEditingTask(null);
    setTaskModalOpen(true);
  }, []);

  const handleEditTask = useCallback((task: Task) => {
    setEditingTask(task);
    setTaskModalOpen(true);
  }, []);

  const handleDeleteTask = useCallback((id: string) => {
    if (confirm("Delete this task?")) {
      void deleteTask(id).catch(() => {});
    }
  }, [deleteTask]);

  const handleTaskSubmit = useCallback(
    async (taskData: Omit<Task, "id" | "createdAt">) => {
      if (editingTask) {
        await updateTask(editingTask.id, taskData);
      } else {
        await addTask(taskData);
      }
      setTaskModalOpen(false);
      setEditingTask(null);
    },
    [editingTask, addTask, updateTask]
  );

  // Focus timer
  const handleFocusMode = useCallback(() => {
    setFocusTimerOpen(true);
  }, []);

  // New project
  const handleNewProject = useCallback(() => {
    setNewProjectName("");
    setNewProjectColor("#7c5cfc");
    setNewProjectModalOpen(true);
  }, []);

  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim()) return;
    try {
      await addProject({ name: newProjectName.trim(), color: newProjectColor });
      setNewProjectModalOpen(false);
    } catch {
      // The provider displays the request error and keeps the dialog open.
    }
  }, [newProjectName, newProjectColor, addProject]);

  // View calendar
  const handleViewCalendar = useCallback(() => {
    router.push("/calendar");
  }, [router]);

  // Quick actions
  const quickActions = defaultQuickActions(
    handleAddTask,
    handleFocusMode,
    handleNewProject,
    handleViewCalendar
  );

  // Handle upcoming event click - select date in calendar
  const handleUpcomingClick = useCallback((event: CalendarEvent) => {
    setSelectedDate(event.date);
  }, []);

  // Close sort menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);


  return (
    <DashboardLayout
      headerProps={{
        onSearch: handleSearchChange,
        searchValue: searchQuery,
        searchInputRef,
      }}
    >
      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-6">
        <StatCard
          icon={<CheckCircle className="h-5 w-5" aria-hidden="true" />}
          iconColor="bg-green-100 text-green-600"
          value={completedCount}
          label="Tasks completed"
        />
        <StatCard
          icon={<CircleDashed className="h-5 w-5" aria-hidden="true" />}
          iconColor="bg-blue-100 text-blue-600"
          value={remainingCount}
          label="Tasks remaining"
        />
        <StatCard
          icon={<Folder className="h-5 w-5" aria-hidden="true" />}
          iconColor="bg-orange-100 text-orange-600"
          value={projects.length}
          label="Projects"
        />
        <StatCard
          icon={<Target className="h-5 w-5" aria-hidden="true" />}
          iconColor="bg-purple-100 text-purple-600"
          value={goals.length}
          label="Goals in progress"
          progress={goalProgress}
        />
      </div>

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-3 mb-6">
        {/* Today Card - spans 2 columns */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                Today
                <span className="text-sm font-normal text-slate-500">
                  {sortedTodayTasks.length} task{sortedTodayTasks.length !== 1 ? "s" : ""}
                </span>
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {/* Sort Dropdown */}
              <div className="relative" ref={sortMenuRef}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="gap-1.5"
                  aria-expanded={showSortMenu}
                  aria-haspopup="listbox"
                  aria-label="Sort tasks"
                >
                  <span className="hidden sm:inline">Sort</span>
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </Button>
                {showSortMenu && (
                  <div
                    className="absolute right-0 top-full mt-1.5 min-w-[140px] rounded-xl bg-white border border-slate-200 shadow-lg py-1 z-50 animate-fade-in"
                    role="listbox"
                    aria-label="Sort options"
                  >
                    {sortOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setSortBy(option.value);
                          setShowSortMenu(false);
                        }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm transition-colors",
                          "focus-visible:outline-none focus-visible:bg-slate-50",
                          sortBy === option.value
                            ? "bg-purple-50 text-purple-600 font-medium"
                            : "text-slate-700 hover:bg-slate-50"
                        )}
                        role="option"
                        aria-selected={sortBy === option.value}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button onClick={handleAddTask} size="sm">
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Add task</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <TaskList
              tasks={sortedTodayTasks}
              onToggle={(id) => { void toggleTask(id).catch(() => {}); }}
              onEdit={handleEditTask}
              onDelete={handleDeleteTask}
              emptyMessage="No tasks for today"
            />
          </CardContent>
        </Card>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Calendar Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Calendar</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <CalendarComp
                selectedDate={selectedDate}
                onSelect={setSelectedDate}
                eventsByDate={eventsByDate}
              />
            </CardContent>
          </Card>

          {/* Upcoming Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Upcoming</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <UpcomingList
                events={upcomingEvents}
                onClick={handleUpcomingClick}
                emptyMessage="No upcoming events"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Productivity Card */}
      <Card className="mb-6">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4">
          <div>
            <CardTitle>Productivity</CardTitle>
            <CardDescription>Completed tasks grouped by their scheduled date</CardDescription>
          </div>
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        </CardHeader>
        <CardContent className="pt-0">
          <ProductivityChart data={chartData} labels={chartLabels} />
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <QuickActions actions={quickActions} />
        </CardContent>
      </Card>

      {/* Floating Action Button - Mobile */}
      <button
        className="fixed bottom-20 right-4 lg:hidden z-40 h-14 w-14 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 text-white shadow-lg shadow-purple-500/30 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
        onClick={handleAddTask}
        aria-label="Add task"
      >
        <Plus className="h-7 w-7" aria-hidden="true" />
      </button>

      {/* Task Modal */}
      <TaskModal
        open={taskModalOpen}
        onClose={() => {
          setTaskModalOpen(false);
          setEditingTask(null);
        }}
        onSubmit={handleTaskSubmit}
        initialTask={editingTask}
      />

      {/* Focus Timer Modal */}
      <FocusTimer open={focusTimerOpen} onClose={() => setFocusTimerOpen(false)} />

      {/* New Project Modal */}
      <Modal
        open={newProjectModalOpen}
        onClose={() => setNewProjectModalOpen(false)}
        title="New Project"
        description="Create a new project to organize your tasks"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Project name"
            placeholder="Enter project name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            autoFocus
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {presetColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewProjectColor(color)}
                  className={cn(
                    "h-10 w-10 rounded-xl border-2 transition-all",
                    newProjectColor === color
                      ? "border-purple-500 scale-110 shadow-md"
                      : "border-transparent hover:border-slate-300"
                  )}
                  style={{ backgroundColor: color } as React.CSSProperties}
                  aria-label={`Select ${color} color`}
                  aria-pressed={newProjectColor === color}
                >
                  {newProjectColor === color && (
                    <CheckCircle className="h-5 w-5 text-white mx-auto my-auto drop-shadow-sm" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setNewProjectModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>
              Create Project
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
