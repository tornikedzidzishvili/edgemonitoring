import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/servers", label: "Servers" },
  { to: "/settings", label: "Settings", adminOnly: true }
];

export default function Shell() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  const visibleNavItems = navItems.filter(
    (item) => !item.adminOnly || user?.role === "admin"
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="font-semibold">Edge Monitoring</div>
          <div className="flex items-center gap-4">
            <nav className="flex gap-2">
              {visibleNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      "rounded-md px-3 py-1.5 text-sm",
                      isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                    ].join(" ")
                  }
                  end={item.to === "/"}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
              <span className="text-sm text-slate-600">{user?.fullName}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
