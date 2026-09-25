import { Link, Outlet } from 'react-router'
import { useAuth } from '../auth'

/** Top bar and page frame for logged-in pages. */
export default function Layout() {
  const { user, logout } = useAuth()
  return (
    <>
      <header className="topbar">
        <h1>
          <Link to="/">PrepFlip</Link>
        </h1>
        <span className="tag">NEET MCQ Practice</span>
        <span className="spacer" />
        <span className="muted user-name">{user?.display_name}</span>
        <button type="button" className="small" onClick={() => void logout()}>
          Log out
        </button>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  )
}
