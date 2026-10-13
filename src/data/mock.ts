interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface MobileNavItem extends NavItem {
  prominent?: boolean;
}

export const navItems: readonly NavItem[] = [
  { label: "Overview", href: "/", icon: "LayoutDashboard" },
  { label: "My Tasks", href: "/tasks", icon: "CheckSquare" },
  { label: "Today", href: "/today", icon: "Sun" },
  { label: "Checklist", href: "/checklist", icon: "ListChecks" },
  { label: "Upcoming", href: "/upcoming", icon: "CalendarClock" },
  { label: "Calendar", href: "/calendar", icon: "Calendar" },
  { label: "Goals", href: "/goals", icon: "Target" },
  { label: "Focus Mode", href: "/focus", icon: "Timer" },
  { label: "Templates", href: "/templates", icon: "FileText" },
  { label: "Family", href: "/family", icon: "Users" },
];

// "Add" and "More" are actions (open the task composer and the more-sheet),
// not routes, so their hrefs are intentionally inert.
export const mobileNavItems: readonly MobileNavItem[] = [
  { label: "Home", href: "/", icon: "Home" },
  { label: "Calendar", href: "/calendar", icon: "Calendar" },
  { label: "Add", href: "#", icon: "Plus", prominent: true },
  { label: "Checklist", href: "/checklist", icon: "ListChecks" },
  { label: "Focus", href: "/focus", icon: "Timer" },
  { label: "More", href: "#", icon: "MoreHorizontal" },
];
