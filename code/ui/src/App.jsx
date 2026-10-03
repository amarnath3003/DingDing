import { useEffect, useState } from 'react'
import { useHub } from './useHub.js'
import BellScreen from './BellScreen.jsx'
import SimPanel from './SimPanel.jsx'

// "/"      -> Bell Screen (the user's screen)
// "/#/sim" -> operator & simulation panel (open in a second window)
export default function App() {
  const hub = useHub()
  const [route, setRoute] = useState(location.hash)
  useEffect(() => {
    const onHash = () => setRoute(location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return route.startsWith('#/sim') ? <SimPanel hub={hub} /> : <BellScreen hub={hub} />
}
