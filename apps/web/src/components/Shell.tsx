import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../lib/auth";
import { useBranding } from "../hooks/useBranding";

const navItems = [
  { to: "/", label: "Dashboard", icon: DashboardIcon },
  { to: "/servers", label: "Servers", icon: ServersIcon },
  { to: "/alerts", label: "Alerts", icon: AlertsIcon },
  { to: "/shared-hosting", label: "Hosting", icon: SharedHostingIcon },
  { to: "/settings", label: "Settings", adminOnly: true, icon: SettingsIcon }
];

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
    </svg>
  );
}

function ServersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm14 1a1 1 0 11-2 0 1 1 0 012 0zM2 13a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2zm14 1a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
    </svg>
  );
}

function SharedHostingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clipRule="evenodd" />
    </svg>
  );
}

function AlertsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" clipRule="evenodd" />
    </svg>
  );
}


function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

export default function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { platformName, hasLogo, logoUrl } = useBranding();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    setUserMenuOpen(false);
    await logout();
  };

  const visibleNavItems = navItems.filter(
    (item) => !item.adminOnly || user?.role === "admin"
  );

  return (
    <div className="min-h-screen bg-obsidian-950 grid-bg">
      {/* Ambient glow effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-neon-cyan/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-neon-violet/5 rounded-full blur-3xl" />
      </div>

      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-obsidian-950/80 backdrop-blur-xl safe-top">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 lg:py-4">
          {/* Logo */}
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            {hasLogo && logoUrl ? (
              <img
                src={logoUrl}
                alt={platformName}
                className="h-8 w-8 rounded-lg object-contain"
              />
            ) : (
              <div className="relative flex h-9 w-9 items-center justify-center">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-neon-cyan to-neon-emerald opacity-20" />
                <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-neon-cyan/30 bg-obsidian-900">
                  <svg className="h-5 w-5 text-neon-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </div>
              </div>
            )}
            <div className="hidden sm:block">
              {hasLogo ? (
                <span className="font-display font-semibold text-white">{platformName}</span>
              ) : (
                <>
                  <span className="font-display font-semibold text-white">Edge</span>
                  <span className="font-display font-semibold text-neon-cyan">Monitor</span>
                </>
              )}
            </div>
          </motion.div>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-1 md:flex">
            {visibleNavItems.map((item, index) => (
              <motion.div
                key={item.to}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                    ].join(" ")
                  }
                  end={item.to === "/"}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              </motion.div>
            ))}
          </nav>

          {/* Desktop User Section */}
          <motion.div
            className="hidden items-center gap-3 md:flex relative"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-700/50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-neon-cyan/20 to-neon-violet/20 text-sm font-medium text-white border border-slate-700/50">
                {user?.fullName?.charAt(0)?.toUpperCase() ?? "U"}
              </div>
              <span className="text-sm font-medium text-slate-300">{user?.fullName}</span>
              <svg className={`h-4 w-4 text-slate-500 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <AnimatePresence>
              {userMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-slate-700/50 bg-obsidian-900 shadow-2xl overflow-hidden"
                  >
                    <div className="p-3 border-b border-slate-700/50 bg-obsidian-800/50">
                      <div className="text-sm font-medium text-white">{user?.fullName}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{user?.email}</div>
                    </div>
                    <div className="p-1">
                      <button
                        type="button"
                        onClick={() => {
                          navigate("/profile");
                          setUserMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        My Profile
                      </button>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-neon-rose hover:bg-neon-rose/10 transition-colors"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                        </svg>
                        Logout
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Mobile: User avatar + menu button */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(!mobileMenuOpen);
                setUserMenuOpen(false);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-neon-cyan/20 to-neon-violet/20 text-sm font-bold text-white border border-slate-700/50 transition-all active:scale-95"
            >
              {user?.fullName?.charAt(0)?.toUpperCase() ?? "U"}
            </button>
          </div>
        </div>

        {/* Mobile Slide-Down User Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden border-t border-slate-800/80 md:hidden"
            >
              <div className="bg-obsidian-900/80 backdrop-blur-xl px-4 py-4 space-y-1">
                <div className="flex items-center gap-3 px-3 pb-3 mb-2 border-b border-slate-800/80">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-neon-cyan/20 to-neon-violet/20 text-sm font-bold text-white border border-slate-700/50">
                    {user?.fullName?.charAt(0)?.toUpperCase() ?? "U"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate">{user?.fullName}</div>
                    <div className="text-xs text-slate-500 truncate">{user?.email}</div>
                  </div>
                </div>
                <NavLink
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-base font-medium text-slate-300 transition-colors active:bg-slate-800/80 hover:bg-slate-800/50"
                >
                  <ProfileIcon className="h-5 w-5" />
                  My Profile
                </NavLink>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-base font-medium text-neon-rose transition-colors active:bg-neon-rose/15 hover:bg-neon-rose/10"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                  </svg>
                  Logout
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 py-6 pb-24 sm:py-8 md:pb-8">
        <Outlet />
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden safe-bottom">
        <div className="border-t border-slate-800/80 bg-obsidian-950/95 backdrop-blur-xl">
          <div className="mx-auto flex max-w-lg items-stretch justify-around px-2">
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  [
                    "relative flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors",
                    isActive
                      ? "text-neon-cyan"
                      : "text-slate-500 active:text-slate-300"
                  ].join(" ")
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.div
                        layoutId="bottomTabIndicator"
                        className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-neon-cyan"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    )}
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}
