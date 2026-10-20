import { Suspense, useState } from "react";
import { Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import CallbackAlerts from "./CallbackAlerts";
import ActivityTracker from "./ActivityTracker";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main>
          {/* Mentre si scarica una pagina aperta per la prima volta, il menu resta visibile */}
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
                <Loader2 className="animate-spin" size={18} /> Caricamento...
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
      <CallbackAlerts />
      <ActivityTracker />
    </div>
  );
}

