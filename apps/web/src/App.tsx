import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import Shell from "./components/Shell";
import Dashboard from "./pages/Dashboard";
import ServersDashboard from "./pages/ServersDashboard";
import ServersManage from "./pages/Servers";
import ServerDetail from "./pages/ServerDetail";
import SharedHosting from "./pages/SharedHosting";
import SharedHostingDetail from "./pages/SharedHostingDetail";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Setup from "./pages/Setup";

function AppRoutes() {
  const { user, loading, setupRequired } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  if (setupRequired) {
    return <Setup />;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/servers" element={<ServersDashboard />} />
        <Route path="/servers/manage" element={<ServersManage />} />
        <Route path="/servers/:id" element={<ServerDetail />} />
        <Route path="/shared-hosting" element={<SharedHosting />} />
        <Route path="/shared-hosting/:id" element={<SharedHostingDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
