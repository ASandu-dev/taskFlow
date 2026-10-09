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
  { label: "Upcoming", href: "/upcoming", icon: "CalendarClock" },
  { label: "Calendar", href: "/calendar", icon: "Calendar" },
  { label: "Goals", href: "/goals", icon: "Target" },
  { label: "Focus Mode", href: "/focus", icon: "Timer" },
  { label: "Templates", href: "/templates", icon: "FileText" },
];

export const mobileNavItems: readonly MobileNavItem[] = [
  { label: "Home", href: "/", icon: "Home" },
  { label: "Calendar", href: "/calendar", icon: "Calendar" },
  { label: "Add", href: "/add", icon: "Plus", prominent: true },
  { label: "Focus", href: "/focus", icon: "Timer" },
  { label: "More", href: "/more", icon: "MoreHorizontal" },
];
