import { useEffect, useState } from 'react'
import Landing from './Landing'
import AdminAccess from './AdminAccess'

function getRoute() {
  return window.location.pathname.replace(/\/+$/, '') || '/'
}

export default function App() {
  const [route, setRoute] = useState(getRoute)

  useEffect(() => {
    const onPop = () => setRoute(getRoute())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  if (route === '/admin/access' || route === '/admin') {
    return <AdminAccess />
  }
  return <Landing />
}
