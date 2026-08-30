import { Outlet } from "react-router-dom";
import "./control.css";

export function ControlLayout() {
  return (
    <main className="page control-page">
      <Outlet />
    </main>
  );
}
