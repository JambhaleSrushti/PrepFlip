import { Link, Navigate, Route, Routes, useLocation } from 'react-router'
import { useAuth } from './auth'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ImportPage from './pages/ImportPage'
import LoginPage from './pages/LoginPage'
import ReviewPage from './pages/ReviewPage'

/** Sends logged-out visitors to /login, remembering where they were going. */
function RequireAuth() {
  const { user } = useAuth()
  const location = useLocation()
  if (user === undefined) {
    return (
      <p className="muted center" role="status">
        Loading…
      </p>
    )
  }
  if (user === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Layout />
}

function NotFound() {
  return (
    <div className="card center">
      <p>That page doesn't exist.</p>
      <Link to="/">Go to your question sets</Link>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route index element={<HomePage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="sets/:id" element={<ReviewPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
