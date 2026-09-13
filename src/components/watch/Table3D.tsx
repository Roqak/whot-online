import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { Card, GameView, PublicPlayer, Suit } from '../../types/game'
import type { Cheer } from '../../store/gameStore'
import { cardTilt } from '../../lib/hand'
import { avatarTexture, cardTexture, disposeCardTextures, emojiTexture, feltTexture, glowTexture, shapeTexture, suitColor } from './cardTexture'
import type { Highlight } from './highlights'
import { splashFor } from './highlights'

export type CameraPreset = 'table' | 'top' | 'seat'
export type DirectorShot = 'auto' | 'table' | 'top' | 'seat'

interface Table3DProps {
  view: GameView
  cheers: Cheer[]
  preset: DirectorShot
  spin: boolean
  seatIndex: number
  onSelectSeat: (playerId: string) => void
  selectedSeat: string | null
  reducedMotion: boolean
  /** One-shot spectacles derived from the latest event batch. */
  highlights: Highlight[]
  /** Epoch ms of the current turn deadline, for the seat countdown arc. */
  deadline: number | null
  /** Called when the canvas never draws, so the caller can show the flat view instead. */
  onStall: () => void
}

const CARD_W = 0.56
const CARD_H = 0.78
const SEAT_RADIUS = 2.1
const PILE_AT: [number, number, number] = [0.38, 0, 0]
const MARKET_AT: [number, number, number] = [-0.55, 0, 0]
const TABLE_VIEW: [number, number, number] = [0, 5.1, 6.6]

const MARIGOLD = '#f2c14e'
const EMBER = '#e2725b'
const INDIGO = '#6c7ae0'

function seatAngle(index: number, count: number) {
  return Math.PI / 2 + (index * Math.PI * 2) / count
}

function seatPosition(index: number, count: number, radius = SEAT_RADIUS): [number, number, number] {
  const a = seatAngle(index, count)
  return [Math.cos(a) * radius, 0, Math.sin(a) * radius]
}

function damp(current: number, target: number, lambda: number, dt: number) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt))
}

function CardMesh({
  card,
  position,
  rotation = [-Math.PI / 2, 0, 0],
  opacity = 1,
  shadow = false,
}: {
  card: Card | null
  position: [number, number, number]
  rotation?: [number, number, number]
  opacity?: number
  shadow?: boolean
}) {
  const texture = cardTexture(card)
  return (
    <mesh position={position} rotation={rotation} castShadow={shadow}>
      <planeGeometry args={[CARD_W, CARD_H]} />
      <meshStandardMaterial
        map={texture}
        roughness={0.72}
        metalness={0.02}
        side={THREE.DoubleSide}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  )
}

/** The newest card flies in from whoever played it, with an arc, spin and landing settle. */
function PileCard({
  card,
  index,
  from,
  reducedMotion,
  whot,
}: {
  card: Card
  index: number
  from: [number, number, number] | null
  reducedMotion: boolean
  whot: boolean
}) {
  const ref = useRef<THREE.Group>(null)
  const startedAt = useRef(performance.now())
  const tilt = cardTilt(card.id)
  const target: [number, number, number] = [PILE_AT[0] + tilt.x / 90, 0.015 + index * 0.006, PILE_AT[2] + tilt.y / 90]
  const settle = useRef(false)

  useFrame(() => {
    const group = ref.current
    if (!group) return
    if (!from || reducedMotion) {
      group.position.set(...target)
      return
    }
    const t = Math.min(1, (performance.now() - startedAt.current) / 620)
    const eased = 1 - Math.pow(1 - t, 3)
    const arc = Math.sin(eased * Math.PI) * 0.7
    group.position.set(
      THREE.MathUtils.lerp(from[0], target[0], eased),
      target[1] + arc,
      THREE.MathUtils.lerp(from[2], target[2], eased),
    )
    group.rotation.y = (1 - eased) * Math.PI * 0.6
    // Whot cards land with a little bounce, like a dealer slapped them down.
    if (whot && t >= 1 && !settle.current) {
      settle.current = true
    }
    if (settle.current) {
      const wobble = Math.sin(performance.now() / 90) * Math.exp(-(performance.now() - startedAt.current - 620) / 260) * 0.09
      if (wobble > 0.001) group.rotation.z = wobble
    }
  })

  return (
    <group ref={ref} position={from ?? target}>
      <CardMesh card={card} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, (tilt.rotate * Math.PI) / 180]} shadow />
    </group>
  )
}

/** Expanding halo on the pile for special-card landings. */
function Shockwave({ at, tone }: { at: [number, number, number]; tone: 'good' | 'bad' | 'neutral' }) {
  const ref = useRef<THREE.Mesh>(null)
  const startedAt = useRef(performance.now())
  const color = tone === 'bad' ? EMBER : tone === 'good' ? MARIGOLD : INDIGO

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const t = (performance.now() - startedAt.current) / 700
    if (t >= 1) {
      mesh.visible = false
      return
    }
    const scale = 0.3 + t * 2.6
    mesh.scale.setScalar(scale)
    const material = mesh.material as THREE.MeshBasicMaterial
    material.opacity = (1 - t) * 0.55
  })

  return (
    <mesh ref={ref} position={[at[0], 0.02, at[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.5, 0.62, 48]} />
      <meshBasicMaterial color={color} transparent depthWrite={false} />
    </mesh>
  )
}

function Market({ count, requested }: { count: number; requested: Suit | null }) {
  const layers = Math.max(1, Math.min(10, Math.ceil(count / 5)))
  const group = useRef<THREE.Group>(null)
  const suitGlow = useMemo(
    () => (requested ? glowTexture(suitColor(requested).replace('#', '').toLowerCase()) : null),
    [requested],
  )

  useFrame(({ clock }) => {
    if (!group.current || requested) return
    // The market breathes so the table never feels frozen.
    const breath = 1 + Math.sin(clock.elapsedTime * 1.4) * 0.012
    group.current.scale.setScalar(breath)
  })

  return (
    <group position={MARKET_AT}>
      <group ref={group}>
        {Array.from({ length: layers }, (_, i) => (
          <CardMesh key={i} card={null} position={[0, 0.012 + i * 0.012, 0]} />
        ))}
      </group>
      {requested && (
        <mesh position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.15, 1.15]} />
          <meshBasicMaterial
            map={suitGlow ?? undefined}
            color={suitColor(requested)}
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </mesh>
      )}
      {requested && (
        <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 12]}>
          <planeGeometry args={[0.34, 0.34]} />
          <meshBasicMaterial
            map={shapeTexture(requested)}
            transparent
            opacity={0.95}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}

/** Floating name + count plate above each seat, drawn as a DOM layer. */
function Seat({
  player,
  index,
  count,
  onTurn,
  selected,
  onSelect,
  isBot,
}: {
  player: PublicPlayer
  index: number
  count: number
  onTurn: boolean
  selected: boolean
  onSelect: () => void
  isBot: boolean
}) {
  const ring = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.Mesh>(null)
  const position = seatPosition(index, count)
  const angle = seatAngle(index, count)
  const cards = Math.min(player.handCount, 8)

  useFrame(({ clock }, dt) => {
    if (ring.current) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 3) * 0.04
      ring.current.scale.setScalar(onTurn ? pulse : 1)
    }
    if (glow.current) {
      const material = glow.current.material as THREE.MeshBasicMaterial
      const target = onTurn ? 0.5 : 0.12
      material.opacity = damp(material.opacity, target, 6, dt)
    }
  })

  return (
    <group position={position} rotation={[0, -angle + Math.PI / 2, 0]}>
      {/* Card fan in the player's hand, face down. */}
      {Array.from({ length: cards }, (_, j) => {
        const offset = (j - (cards - 1) / 2) * 0.19
        return (
          <CardMesh
            key={j}
            card={null}
            position={[offset, 0.02 + j * 0.002, 0]}
            rotation={[-Math.PI / 2, 0, offset * 0.35]}
          />
        )
      })}

      {/* Floor glow tinted to the seat's state. */}
      <mesh ref={glow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <planeGeometry args={[1.9, 1.9]} />
        <meshBasicMaterial
          map={glowTexture(onTurn ? MARIGOLD : selected ? INDIGO : '#00000000')}
          color={onTurn ? MARIGOLD : selected ? INDIGO : '#000000'}
          transparent
          opacity={0.12}
          depthWrite={false}
        />
      </mesh>

      {(onTurn || selected) && (
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
          <ringGeometry args={[0.72, 0.82, 48]} />
          <meshBasicMaterial color={onTurn ? MARIGOLD : INDIGO} transparent opacity={onTurn ? 0.85 : 0.5} />
        </mesh>
      )}

      {/* Emoji avatar medallion standing at the seat rim, always facing the camera. */}
      <AvatarBillboard avatarId={player.avatar} position={[0, 0.62, 0.12]} scale={onTurn ? 1.16 : 1} dim={player.eliminated || player.left} />

      <Html position={[0, 0.92, 0]} center distanceFactor={6.4} zIndexRange={[20, 0]}>
        <button
          onClick={onSelect}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-xs ${
            onTurn ? 'bg-marigold text-table-950' : 'bg-table-950/85 text-fg'
          } ${selected ? 'ring-2 ring-[#6c7ae0]' : ''}`}
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          <span className="font-semibold">{player.name}</span>
          {isBot && <span aria-hidden="true">🤖</span>}
          <span className="opacity-70">{player.handCount}</span>
          {player.announcedLastCard && <span className="font-bold">· last card</span>}
          {player.eliminated && <span className="opacity-70">· out</span>}
        </button>
      </Html>
    </group>
  )
}

/** Emoji sprite that billboards toward the camera and gently bobs. */
function AvatarBillboard({
  avatarId,
  position,
  scale,
  dim,
}: {
  avatarId: string
  position: [number, number, number]
  scale: number
  dim: boolean
}) {
  const ref = useRef<THREE.Mesh>(null)
  const texture = useMemo(() => avatarTexture(avatarId), [avatarId])

  useFrame(({ camera, clock }, dt) => {
    const mesh = ref.current
    if (!mesh) return
    mesh.quaternion.copy(camera.quaternion)
    const material = mesh.material as THREE.MeshBasicMaterial
    const target = dim ? 0.35 : 1
    material.opacity = damp(material.opacity, target, 5, dt)
    const bob = 1 + Math.sin(clock.elapsedTime * 2 + position[0] * 3) * 0.03
    mesh.scale.setScalar(scale * bob)
  })

  return (
    <mesh ref={ref} position={position} scale={scale}>
      <circleGeometry args={[0.19, 32]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  )
}

function CheerSprite({ emoji, origin }: { emoji: string; origin: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null)
  const startedAt = useRef(performance.now())
  const texture = emojiTexture(emoji)

  useFrame(({ camera }) => {
    const mesh = ref.current
    if (!mesh) return
    const t = Math.min(1, (performance.now() - startedAt.current) / 2400)
    mesh.position.set(origin[0], origin[1] + 0.25 + t * 0.95, origin[2])
    mesh.quaternion.copy(camera.quaternion)
    const material = mesh.material as THREE.MeshBasicMaterial
    material.opacity = 1 - t * t
    mesh.scale.setScalar(1 + t * 0.6)
  })

  return (
    <mesh ref={ref} position={origin}>
      <planeGeometry args={[0.42, 0.42]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  )
}

/** Big centred callout ("PICK TWO!") that punches in and fades. */
function Splash({ text, tone, seq }: { text: string; tone: 'neutral' | 'good' | 'bad'; seq: number }) {
  const [gone, setGone] = useState(false)
  useEffect(() => {
    setGone(false)
    const id = setTimeout(() => setGone(true), 1150)
    return () => clearTimeout(id)
  }, [seq])
  if (gone) return null
  const color = tone === 'bad' ? EMBER : tone === 'good' ? MARIGOLD : INDIGO
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center" style={{ perspective: '600px' }}>
      <span
        key={seq}
        className="font-display text-4xl font-extrabold uppercase tracking-wider drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:text-6xl"
        style={{
          color,
          animation: `watch-splash 1.15s cubic-bezier(0.16, 1, 0.3, 1) both`,
        }}
      >
        {text}
      </span>
    </div>
  )
}

/**
 * Director camera: cuts between shots with eased flights, keeps orbiting in auto
 * mode, and flies to whoever just did something loud.
 */
function CameraRig({
  preset,
  seatIndex,
  seatCount,
  punchKey,
}: {
  preset: DirectorShot
  seatIndex: number
  seatCount: number
  punchKey: number
}) {
  const { camera, size } = useThree()
  const flight = useRef<{ from: THREE.Vector3; to: THREE.Vector3; start: number } | null>(null)
  const punch = useRef(0)
  const lastPunch = useRef(punchKey)

  useEffect(() => {
    if (lastPunch.current === punchKey) return
    lastPunch.current = punchKey
    punch.current = 1
  }, [punchKey])

  useEffect(() => {
    const portrait = size.width / Math.max(1, size.height) < 0.85
    const lens = camera as THREE.PerspectiveCamera
    lens.fov = portrait ? 62 : 45
    lens.updateProjectionMatrix()
    const fit = portrait ? 1.18 : 1

    const to = new THREE.Vector3()
    if (preset === 'top') to.set(0, 7.6 * fit, 0.001)
    else if (preset === 'seat') {
      const [x, , z] = seatPosition(seatIndex, seatCount, (SEAT_RADIUS + 2.5) * fit)
      to.set(x, 2.7 * fit, z)
    } else if (portrait) {
      to.set(TABLE_VIEW[0], TABLE_VIEW[1] * 0.92, TABLE_VIEW[2] * 1.22)
    } else to.set(...TABLE_VIEW)
    flight.current = { from: camera.position.clone(), to, start: performance.now() }
  }, [preset, seatIndex, seatCount, camera, size.width, size.height])

  useFrame((_, dt) => {
    // Camera punch: a quick dolly-in kick on big moments.
    if (punch.current > 0) {
      punch.current = Math.max(0, punch.current - dt * 2.6)
      const k = Math.sin(punch.current * Math.PI) * 0.35
      camera.position.multiplyScalar(1 - k * dt * 4)
    }
    const move = flight.current
    if (!move) return
    const t = Math.min(1, (performance.now() - move.start) / 1100)
    const eased = 1 - Math.pow(1 - t, 4)
    camera.position.lerpVectors(move.from, move.to, eased)
    camera.lookAt(0, 0.15, 0)
    if (t >= 1) flight.current = null
  })

  return null
}

/** Soft arena: rim wall, ceiling glow, and a hush of background columns. */
function Arena() {
  return (
    <group>
      {/* Ring wall far out, barely visible in the fog. */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[7.4, 7.6, 1.2, 64, 1, true]} />
        <meshStandardMaterial color="#1b2148" side={THREE.BackSide} roughness={0.9} />
      </mesh>
      {/* Four banner columns at the compass points. */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 6.6, 1.1, Math.sin(a) * 6.6]}>
            <boxGeometry args={[0.5, 2.2, 0.5]} />
            <meshStandardMaterial color="#262e5e" roughness={0.85} emissive={i === 0 ? '#f2c14e' : '#000000'} emissiveIntensity={0.06} />
          </mesh>
        )
      })}
    </group>
  )
}

function TableSurface({ requestedShape }: { requestedShape: Suit | null }) {
  const map = useMemo(() => feltTexture(), [])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[3.3, 64]} />
        <meshStandardMaterial map={map} color="#2a3160" roughness={0.95} metalness={0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <ringGeometry args={[3.3, 3.62, 64]} />
        <meshStandardMaterial color="#3d2a1e" roughness={0.65} metalness={0.1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[1.55, 1.6, 64]} />
        <meshBasicMaterial color={MARIGOLD} transparent opacity={0.12} />
      </mesh>
      {requestedShape && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
          <ringGeometry args={[1.62, 1.74, 64]} />
          <meshBasicMaterial color={suitColor(requestedShape)} transparent opacity={0.4} />
        </mesh>
      )}
    </group>
  )
}

function Scene({ view, cheers, preset, spin, seatIndex, onSelectSeat, selectedSeat, reducedMotion, highlights }: Table3DProps) {
  const seated = view.players
  const count = Math.max(seated.length, 2)
  const latest = highlights[highlights.length - 1]
  const [splash, setSplash] = useState<{ text: string; tone: 'neutral' | 'good' | 'bad'; seq: number } | null>(null)
  const [wave, setWave] = useState<{ at: [number, number, number]; tone: 'good' | 'bad' | 'neutral'; seq: number } | null>(null)
  const seq = useRef(0)

  const playedFrom = useMemo(() => {
    const index = seated.findIndex((p) => p.id === view.turnPlayerId)
    return index >= 0 ? seatPosition(index, count) : null
  }, [seated, view.turnPlayerId, count])

  // React to the newest highlight: splash text, shockwave, and seat flash.
  useEffect(() => {
    if (!latest) return
    const id = ++seq.current
    const text = splashFor(latest)
    if (text) setSplash({ text, tone: latest.kind === 'caught' ? 'bad' : latest.kind === 'roundOver' || latest.kind === 'matchOver' || latest.kind === 'lastCard' ? 'good' : 'neutral', seq: id })
    if (latest.kind === 'special' || latest.kind === 'pick' || latest.kind === 'generalMarket') {
      const at = latest.playerId ? seatFromPlayer(seated, count, latest.playerId) : [0, 0, 0]
      setWave({ at: at as [number, number, number], tone: 'bad', seq: id })
    }
  }, [latest, seated, count])

  const cheerOrigin = (targetId: string | null): [number, number, number] => {
    const index = seated.findIndex((p) => p.id === targetId)
    return index >= 0 ? seatPosition(index, count, SEAT_RADIUS - 0.3) : [0, 0.4, 0]
  }

  return (
    <>
      <color attach="background" args={['#0e1022']} />
      <fog attach="fog" args={['#0e1022', 10, 22]} />
      <ambientLight intensity={0.72} />
      <directionalLight
        position={[4, 9, 5]}
        intensity={1.05}
        castShadow={false}
      />
      {/* Dealer's lamp over the pile. */}
      <pointLight position={[0, 2.6, 0]} intensity={9} distance={9} color={MARIGOLD} />
      {/* Cool wash from the market side. */}
      <pointLight position={[-3, 2.2, 2]} intensity={4} distance={8} color={INDIGO} />

      <Arena />
      <TableSurface requestedShape={view.requestedShape} />
      <Market count={view.marketCount} requested={view.requestedShape} />

      {view.pile.slice(-5).map((card, i, list) => (
        <PileCard
          key={card.id}
          card={card}
          index={i}
          from={i === list.length - 1 ? playedFrom : null}
          reducedMotion={reducedMotion}
          whot={card.shape === 'whot'}
        />
      ))}

      {wave && !reducedMotion && <Shockwave key={wave.seq} at={wave.at} tone={wave.tone} />}

      {seated.map((player, index) => (
        <Seat
          key={player.id}
          player={player}
          index={index}
          count={count}
          onTurn={view.turnPlayerId === player.id && view.phase === 'playing'}
          selected={selectedSeat === player.id}
          onSelect={() => onSelectSeat(player.id)}
          isBot={player.isBot}
        />
      ))}

      {cheers.map((cheer) => (
        <CheerSprite key={cheer.key} emoji={cheer.emoji} origin={cheerOrigin(cheer.targetId)} />
      ))}

      <CameraRig preset={preset} seatIndex={seatIndex} seatCount={count} punchKey={latest?.id ?? 0} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        autoRotate={spin && !reducedMotion}
        autoRotateSpeed={0.5}
        minDistance={4}
        maxDistance={14}
        minPolarAngle={0.15}
        maxPolarAngle={1.38}
        target={[0, 0, 0]}
      />
      {splash && <Splash key={splash.seq} text={splash.text} tone={splash.tone} seq={splash.seq} />}
    </>
  )
}

function seatFromPlayer(players: PublicPlayer[], count: number, playerId: string): [number, number, number] {
  const index = players.findIndex((p) => p.id === playerId)
  return index >= 0 ? seatPosition(index, count) : [0, 0, 0]
}

/**
 * React Three Fiber sizes the renderer from a measurement of its container, and that
 * measurement can come back as zero. The canvas then mounts and runs frames, but the
 * camera projection is degenerate so nothing is drawn. Re-measure from the DOM, and
 * if it never recovers, ask the caller for the flat view instead of showing nothing.
 */
function SizeGuard({ onStall }: { onStall: () => void }) {
  const size = useThree((s) => s.size)
  const setSize = useThree((s) => s.setSize)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const stall = useRef(onStall)
  stall.current = onStall

  useEffect(() => {
    if (size.width > 0 && size.height > 0) return
    const host = gl.domElement.parentElement

    const repair = () => {
      const rect = host?.getBoundingClientRect()
      if (!rect || rect.width < 1 || rect.height < 1) return
      setSize(rect.width, rect.height)
      const lens = camera as THREE.PerspectiveCamera
      lens.aspect = rect.width / rect.height
      lens.updateProjectionMatrix()
    }

    repair()
    const retries = [120, 350, 800, 1500].map((delay) => setTimeout(repair, delay))
    return () => retries.forEach(clearTimeout)
  }, [size.width, size.height, gl, setSize, camera])

  // Frames can run against an empty scene, drawing nothing at all. Draw calls tell them apart.
  useEffect(() => {
    const watchdog = setTimeout(() => {
      if (gl.info.render.calls === 0) stall.current()
    }, 3500)
    return () => clearTimeout(watchdog)
  }, [gl])

  return null
}

export default function Table3D(props: Table3DProps) {
  const [failed, setFailed] = useState(false)

  useEffect(() => () => disposeCardTextures(), [])

  if (failed) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-sm text-fg-muted">
        3D could not start on this device. The live commentary below still works.
      </div>
    )
  }

  return (
    <Canvas
      dpr={[1, 1.75]}
      resize={{ debounce: 0, scroll: false }}
      camera={{ position: TABLE_VIEW, fov: 45 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', () => setFailed(true))
      }}
    >
      <SizeGuard onStall={props.onStall} />
      <Scene {...props} />
    </Canvas>
  )
}