import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { Card, GameView, PublicPlayer } from '../../types/game'
import type { Cheer } from '../../store/gameStore'
import { cardTilt } from '../../lib/hand'
import { getAvatar } from '../../lib/avatars'
import { cardTexture, disposeCardTextures, emojiTexture } from './cardTexture'

export type CameraPreset = 'table' | 'top' | 'seat'

interface Table3DProps {
  view: GameView
  cheers: Cheer[]
  preset: CameraPreset
  spin: boolean
  seatIndex: number
  onSelectSeat: (playerId: string) => void
  selectedSeat: string | null
  reducedMotion: boolean
  /** Called when the canvas never draws, so the caller can show the flat view instead. */
  onStall: () => void
}

const CARD_W = 0.56
const CARD_H = 0.78
const SEAT_RADIUS = 2.1
const PILE_AT: [number, number, number] = [0.38, 0, 0]
const MARKET_AT: [number, number, number] = [-0.55, 0, 0]
const TABLE_VIEW: [number, number, number] = [0, 5.1, 6.6]

function seatAngle(index: number, count: number) {
  return Math.PI / 2 + (index * Math.PI * 2) / count
}

function seatPosition(index: number, count: number, radius = SEAT_RADIUS): [number, number, number] {
  const a = seatAngle(index, count)
  return [Math.cos(a) * radius, 0, Math.sin(a) * radius]
}

function CardMesh({
  card,
  position,
  rotation = [-Math.PI / 2, 0, 0],
  opacity = 1,
}: {
  card: Card | null
  position: [number, number, number]
  rotation?: [number, number, number]
  opacity?: number
}) {
  const texture = cardTexture(card)
  return (
    <mesh position={position} rotation={rotation}>
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

/** The newest card flies in from whoever played it. */
function PileCard({ card, index, from, reducedMotion }: { card: Card; index: number; from: [number, number, number] | null; reducedMotion: boolean }) {
  const ref = useRef<THREE.Group>(null)
  const startedAt = useRef(performance.now())
  const tilt = cardTilt(card.id)
  const target: [number, number, number] = [PILE_AT[0] + tilt.x / 90, 0.015 + index * 0.006, PILE_AT[2] + tilt.y / 90]

  useFrame(() => {
    const group = ref.current
    if (!group) return
    if (!from || reducedMotion) {
      group.position.set(...target)
      return
    }
    const t = Math.min(1, (performance.now() - startedAt.current) / 620)
    const eased = 1 - Math.pow(1 - t, 3)
    group.position.set(
      THREE.MathUtils.lerp(from[0], target[0], eased),
      target[1] + Math.sin(eased * Math.PI) * 0.7,
      THREE.MathUtils.lerp(from[2], target[2], eased),
    )
    group.rotation.y = (1 - eased) * Math.PI * 0.6
  })

  return (
    <group ref={ref} position={from ?? target}>
      <CardMesh card={card} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, (tilt.rotate * Math.PI) / 180]} />
    </group>
  )
}

function Market({ count }: { count: number }) {
  const layers = Math.max(1, Math.min(10, Math.ceil(count / 5)))
  return (
    <group position={MARKET_AT}>
      {Array.from({ length: layers }, (_, i) => (
        <CardMesh key={i} card={null} position={[0, 0.012 + i * 0.012, 0]} />
      ))}
    </group>
  )
}

function Seat({
  player,
  index,
  count,
  onTurn,
  selected,
  onSelect,
}: {
  player: PublicPlayer
  index: number
  count: number
  onTurn: boolean
  selected: boolean
  onSelect: () => void
}) {
  const ring = useRef<THREE.Mesh>(null)
  const position = seatPosition(index, count)
  const angle = seatAngle(index, count)
  const cards = Math.min(player.handCount, 8)
  const avatar = getAvatar(player.avatar)

  useFrame(({ clock }) => {
    if (!ring.current) return
    const pulse = 1 + Math.sin(clock.elapsedTime * 3) * 0.04
    ring.current.scale.setScalar(onTurn ? pulse : 1)
  })

  return (
    <group position={position} rotation={[0, -angle + Math.PI / 2, 0]}>
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

      {(onTurn || selected) && (
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
          <ringGeometry args={[0.72, 0.82, 48]} />
          <meshBasicMaterial color={onTurn ? '#f2c14e' : '#6c7ae0'} transparent opacity={onTurn ? 0.85 : 0.5} />
        </mesh>
      )}

      <Html position={[0, 0.7, 0]} center distanceFactor={6.4} zIndexRange={[20, 0]}>
        <button
          onClick={onSelect}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-xs ${
            onTurn ? 'bg-marigold text-table-950' : 'bg-table-950/85 text-fg'
          } ${selected ? 'ring-2 ring-[#6c7ae0]' : ''}`}
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          <span>{avatar.emoji}</span>
          <span className="font-semibold">{player.name}</span>
          <span className="opacity-70">{player.handCount}</span>
          {player.announcedLastCard && <span className="font-bold">· last card</span>}
          {player.eliminated && <span className="opacity-70">· out</span>}
        </button>
      </Html>
    </group>
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
  })

  return (
    <mesh ref={ref} position={origin}>
      <planeGeometry args={[0.42, 0.42]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  )
}

function TableSurface() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[3.3, 64]} />
        <meshStandardMaterial color="#252c57" roughness={0.95} metalness={0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <ringGeometry args={[3.3, 3.62, 64]} />
        <meshStandardMaterial color="#3d2a1e" roughness={0.65} metalness={0.1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[1.55, 1.6, 64]} />
        <meshBasicMaterial color="#f2c14e" transparent opacity={0.12} />
      </mesh>
    </group>
  )
}

function CameraRig({ preset, seatIndex, seatCount }: { preset: CameraPreset; seatIndex: number; seatCount: number }) {
  const { camera, size } = useThree()
  const flight = useRef<{ from: THREE.Vector3; to: THREE.Vector3; start: number } | null>(null)

  useEffect(() => {
    // A tall phone screen sees far less width, so it needs a wider lens and more distance.
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
      // Flatter and further back, so the table fills the tall frame.
      to.set(TABLE_VIEW[0], TABLE_VIEW[1] * 0.92, TABLE_VIEW[2] * 1.22)
    } else to.set(...TABLE_VIEW)
    flight.current = { from: camera.position.clone(), to, start: performance.now() }
  }, [preset, seatIndex, seatCount, camera, size.width, size.height])

  useFrame(() => {
    const move = flight.current
    if (!move) return
    const t = Math.min(1, (performance.now() - move.start) / 900)
    const eased = 1 - Math.pow(1 - t, 3)
    camera.position.lerpVectors(move.from, move.to, eased)
    camera.lookAt(0, 0.15, 0)
    if (t >= 1) flight.current = null
  })

  return null
}

function Scene({ view, cheers, preset, spin, seatIndex, onSelectSeat, selectedSeat, reducedMotion }: Table3DProps) {
  const seated = view.players
  const count = Math.max(seated.length, 2)
  const playedFrom = useMemo(() => {
    const index = seated.findIndex((p) => p.id === view.turnPlayerId)
    return index >= 0 ? seatPosition(index, count) : null
  }, [seated, view.turnPlayerId, count])

  const cheerOrigin = (targetId: string | null): [number, number, number] => {
    const index = seated.findIndex((p) => p.id === targetId)
    return index >= 0 ? seatPosition(index, count, SEAT_RADIUS - 0.3) : [0, 0.4, 0]
  }

  return (
    <>
      <color attach="background" args={['#0e1022']} />
      <fog attach="fog" args={['#0e1022', 10, 22]} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[4, 9, 5]} intensity={1.15} />
      <pointLight position={[0, 2.6, 0]} intensity={9} distance={9} color="#f2c14e" />

      <TableSurface />
      <Market count={view.marketCount} />

      {view.pile.slice(-5).map((card, i, list) => (
        <PileCard
          key={card.id}
          card={card}
          index={i}
          from={i === list.length - 1 ? playedFrom : null}
          reducedMotion={reducedMotion}
        />
      ))}

      {seated.map((player, index) => (
        <Seat
          key={player.id}
          player={player}
          index={index}
          count={count}
          onTurn={view.turnPlayerId === player.id && view.phase === 'playing'}
          selected={selectedSeat === player.id}
          onSelect={() => onSelectSeat(player.id)}
        />
      ))}

      {cheers.map((cheer) => (
        <CheerSprite key={cheer.key} emoji={cheer.emoji} origin={cheerOrigin(cheer.targetId)} />
      ))}

      <CameraRig preset={preset} seatIndex={seatIndex} seatCount={count} />
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
    </>
  )
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
