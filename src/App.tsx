import { useState, useEffect } from 'react'
import { ControlPanel } from './components/ControlPanel'
import { OverlayPanel } from './components/OverlayPanel'
import NotificationBar from './components/NotificationBar'
import { useAppStore } from './store/appStore'

function App() {
  const [route, setRoute] = useState(window.location.hash)
  const { setLcuConnected, setGamePhase, setOverlayInteractive } = useAppStore()

  // Routing watcher
  useEffect(() => {
    const handleHash = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  // Strict Event-Driven IPC to Store Binding
  useEffect(() => {
    if (!window.electronAPI) return

    const unsubInteractive = window.electronAPI.overlay.onInteractiveState((interactive) => {
      setOverlayInteractive(interactive)
    })

    const unsubLcuConnected = window.electronAPI.lcu.onConnected((info) => {
      console.log('[Frontend] LCU Connected:', info)
      setLcuConnected(true)
    })

    const unsubLcuDisconnected = window.electronAPI.lcu.onDisconnected(() => {
      console.log('[Frontend] LCU Disconnected')
      setLcuConnected(false)
      setGamePhase('None')
    })

    const unsubGamePhase = window.electronAPI.lcu.onGameflowPhase((phase) => {
      console.log('[Frontend] Game Phase:', phase)
      setGamePhase(phase as any)
    })

    // Fetch initial status
    window.electronAPI.lcu.getStatus().then(status => {
      setLcuConnected(status.connected)
      setGamePhase((status.phase || 'None') as any)
    }).catch(() => {})

    return () => {
      unsubInteractive()
      unsubLcuConnected()
      unsubLcuDisconnected()
      unsubGamePhase()
    }
  }, [setLcuConnected, setGamePhase, setOverlayInteractive])

  // Hash-based routing
  if (route === '#/overlay') return <OverlayPanel />
  if (route === '#/notification') return <NotificationBar />
  return <ControlPanel />
}

export default App
