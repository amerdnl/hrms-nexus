import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  return (
    /* `pt-20` on <main> pays for Sidebar's fixed hamburger below md, and
       `md:p-8` cancels it from md up where the button is hidden. The two are
       coupled - changing one without the other overlaps the page heading. */
    <div className="min-h-screen bg-canvas md:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pb-8 pt-20 sm:px-6 md:p-8 lg:p-10">
        <Outlet />
      </main>
    </div>
  );
}
