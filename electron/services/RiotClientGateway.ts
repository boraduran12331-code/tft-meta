import { EventEmitter } from 'events'
import LCUConnector from 'lcu-connector'
import WebSocket from 'ws'
import https from 'https'

export interface LCUCredentials {
  port: number
  password: string
  protocol: string
  address: string
  username?: string
}

/**
 * RiotClientGateway
 *
 * Replaces the custom lockfile poller. Uses official lcu-connector for discovery
 * and ws for event-driven WebSockets. 
 *
 * Events Emitted:
 * - connected / disconnected
 * - gameflow-phase (string)
 * - tft-session (object)
 * - summoner-info (object)
 * - eog-stats (object)
 */
export class RiotClientGateway extends EventEmitter {
  private connector: any
  private ws: WebSocket | null = null
  private credentials: LCUCredentials | null = null
  
  // State cache
  private isConnected: boolean = false
  private currentPhase: string = 'None'

  constructor() {
    super()
    this.connector = new LCUConnector()

    this.connector.on('connect', (data: LCUCredentials) => {
      console.log('[RiotClientGateway] LCU Connector discovered credentials:', data.port)
      this.credentials = data
      this.isConnected = true
      this.emit('connected', data)
      this.connectWebSocket(data)
    })

    this.connector.on('disconnect', () => {
      console.log('[RiotClientGateway] LCU Connector lost connection.')
      this.isConnected = false
      this.credentials = null
      this.currentPhase = 'None'
      this.emit('disconnected')
      this.cleanupWebSocket()
    })
  }

  public start() {
    console.log('[RiotClientGateway] Starting auto-discovery...')
    this.connector.start()
  }

  public stop() {
    this.connector.stop()
    this.cleanupWebSocket()
  }

  public getStatus() {
    return {
      connected: this.isConnected,
      phase: this.currentPhase,
      port: this.credentials?.port || null
    }
  }

  private connectWebSocket(creds: LCUCredentials) {
    this.cleanupWebSocket()

    const url = `wss://${creds.username || 'riot'}:${creds.password}@127.0.0.1:${creds.port}`
    console.log(`[RiotClientGateway] Connecting WebSocket to ${url.replace(/:.+@/, ':***@')}...`)

    this.ws = new WebSocket(url, {
      rejectUnauthorized: false
    })

    this.ws.on('open', () => {
      console.log('[RiotClientGateway] WebSocket Connected.')
      
      // Subscribe to LCU events
      this.ws?.send(JSON.stringify([5, 'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase']))
      this.ws?.send(JSON.stringify([5, 'OnJsonApiEvent_lol-gameflow_v1_session']))
      this.ws?.send(JSON.stringify([5, 'OnJsonApiEvent_lol-summoner_v1_current-summoner']))
      this.ws?.send(JSON.stringify([5, 'OnJsonApiEvent_lol-end-of-game_v1_eog-stats-block']))
    })

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        if (!data || data.toString().length === 0) return
        const payload = JSON.parse(data.toString())
        
        // WAMP format is [ opcode, eventName, data ]
        if (Array.isArray(payload) && payload.length === 3 && payload[0] === 8) {
          const eventName = payload[1]
          const eventData = payload[2]
          
          if (eventName === 'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase') {
            this.currentPhase = eventData.data
            this.emit('gameflow-phase', this.currentPhase)
          } 
          else if (eventName === 'OnJsonApiEvent_lol-gameflow_v1_session') {
            this.emit('gameflow-session', eventData.data)
          }
          else if (eventName === 'OnJsonApiEvent_lol-end-of-game_v1_eog-stats-block') {
            this.emit('eog-stats', eventData.data)
          }
          else if (eventName === 'OnJsonApiEvent_lol-summoner_v1_current-summoner') {
            this.emit('summoner-info', eventData.data)
          }
        }
      } catch (err) {
        // Safe catch, LCU sends weird WAMP pings occasionally
      }
    })

    this.ws.on('error', (err) => {
      console.error('[RiotClientGateway] WebSocket Error:', err.message)
    })

    this.ws.on('close', () => {
      console.log('[RiotClientGateway] WebSocket Closed.')
    })
  }

  private cleanupWebSocket() {
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close()
      }
      this.ws.removeAllListeners()
      this.ws = null
    }
  }

  /**
   * Safe fetch utilizing current credentials to execute REST commands against LCU.
   */
  public async request(method: string, endpoint: string, body?: any) {
    if (!this.isConnected || !this.credentials) return null

    return new Promise((resolve, reject) => {
      const opts: https.RequestOptions = {
        hostname: '127.0.0.1',
        port: this.credentials!.port,
        path: endpoint,
        method: method,
        rejectUnauthorized: false,
        headers: {
          Authorization: 'Basic ' + Buffer.from(`riot:${this.credentials!.password}`).toString('base64'),
          'Content-Type': 'application/json'
        }
      }

      const req = https.request(opts, (res) => {
        let raw = ''
        res.on('data', chunk => raw += chunk)
        res.on('end', () => {
          try {
            resolve(raw ? JSON.parse(raw) : null)
          } catch(e) {
            resolve(raw)
          }
        })
      })

      req.on('error', (err) => reject(err))

      if (body) {
        req.write(JSON.stringify(body))
      }
      req.end()
    })
  }
}
