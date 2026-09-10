import { Outlet } from "react-router-dom";
import AppHeader from "./AppHeader";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-canvas md:flex">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />

        {/* id is the target of the skip link in Sidebar. tabIndex={-1} is what
            makes it focusable as a skip destination without adding a tab stop. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-6 sm:px-6 md:p-8 lg:p-10"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
