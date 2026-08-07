import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pb-8 pt-20 sm:px-6 md:p-8 lg:p-10">
        <Outlet />
      </main>
    </div>
  );
}
