import { Route, Routes } from "react-router-dom";
import { publicRoutes, protectedRoutes } from "@/routes/routes.config";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export function Router() {
  return (
    <Routes>
      {/* Public Routes */}
      {publicRoutes.map(({ path, element, layout: Layout }) => (
        <Route key={path} path={path} element={<Layout>{element}</Layout>} />
      ))}

      {/* Protected Routes */}
      {protectedRoutes.map(({ path, element, layout: Layout, roles }) => (
        <Route
          key={path}
          path={path}
          element={
            <ProtectedRoute allowedRoles={roles}>
              <Layout>{element}</Layout>
            </ProtectedRoute>
          }
        />
      ))}
    </Routes>
  );
}
