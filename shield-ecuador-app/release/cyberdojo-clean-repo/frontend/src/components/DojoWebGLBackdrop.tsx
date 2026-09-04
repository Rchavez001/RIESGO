import React from 'react'
import * as THREE from 'three'

const DPR_CAP = 1.5
const TARGET_FPS = 60
const FRAME_INTERVAL = 1000 / TARGET_FPS

export function DojoWebGLBackdrop() {
  const mountRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 90)
    camera.position.set(0, 1.5, 9)

    const renderer = new THREE.WebGLRenderer({
      antialias: !coarsePointer,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP))
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    const fogColor = new THREE.Color('#04101d')
    scene.fog = new THREE.FogExp2(fogColor, 0.045)

    const clock = new THREE.Clock()
    const mouse = new THREE.Vector2(0, 0)
    let frameId = 0
    let lastFrame = 0
    let visible = document.visibilityState === 'visible'

    const ambient = new THREE.AmbientLight('#7dd3fc', 0.38)
    const keyLight = new THREE.PointLight('#00f0ff', 8, 18)
    keyLight.position.set(-4, 3, 4)
    const rimLight = new THREE.PointLight('#e63946', 5, 16)
    rimLight.position.set(5, -1.4, 2)
    scene.add(ambient, keyLight, rimLight)

    const grid = new THREE.GridHelper(30, 44, 0x00f0ff, 0x12324b)
    grid.position.y = -2.9
    grid.material.transparent = true
    ;(grid.material as any).opacity = 0.24
    scene.add(grid)

    const ringGroup = new THREE.Group()
    scene.add(ringGroup)
    for (let index = 0; index < 4; index += 1) {
      const geometry = new THREE.TorusGeometry(2.2 + index * 0.55, 0.008, 8, 128)
      const material = new THREE.MeshBasicMaterial({
        color: index % 2 === 0 ? '#00f0ff' : '#f5c518',
        transparent: true,
        opacity: 0.18 - index * 0.025,
      })
      const ring = new THREE.Mesh(geometry, material)
      ring.rotation.x = Math.PI / 2.8
      ring.rotation.z = index * 0.42
      ring.position.set(0, -0.7 + index * 0.1, -1.8)
      ringGroup.add(ring)
    }

    const particleCount = coarsePointer ? 420 : 760
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const cyan = new THREE.Color('#00f0ff')
    const red = new THREE.Color('#e63946')
    const gold = new THREE.Color('#f5c518')

    for (let index = 0; index < particleCount; index += 1) {
      const i3 = index * 3
      positions[i3] = (Math.random() - 0.5) * 24
      positions[i3 + 1] = (Math.random() - 0.5) * 12
      positions[i3 + 2] = (Math.random() - 0.5) * 18

      const color = index % 11 === 0 ? gold : index % 5 === 0 ? red : cyan
      colors[i3] = color.r
      colors[i3 + 1] = color.g
      colors[i3 + 2] = color.b
    }

    const particleGeometry = new THREE.BufferGeometry()
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        size: coarsePointer ? 0.026 : 0.022,
        vertexColors: true,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    scene.add(particles)

    const bladeGeometry = new THREE.PlaneGeometry(0.028, 4.8)
    const bladeMaterial = new THREE.MeshBasicMaterial({
      color: '#00f0ff',
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const blades = Array.from({ length: coarsePointer ? 12 : 22 }).map((_, index) => {
      const blade = new THREE.Mesh(bladeGeometry, bladeMaterial.clone())
      blade.position.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 8, -2 - Math.random() * 8)
      blade.rotation.z = -0.72 + Math.random() * 0.2
      blade.rotation.y = Math.random() * Math.PI
      blade.userData.speed = 0.22 + Math.random() * 0.55
      blade.userData.phase = Math.random() * Math.PI * 2
      scene.add(blade)
      return blade
    })

    function resize() {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP))
      renderer.setSize(window.innerWidth, window.innerHeight)
    }

    function onPointerMove(event: PointerEvent) {
      mouse.x = (event.clientX / window.innerWidth - 0.5) * 2
      mouse.y = (event.clientY / window.innerHeight - 0.5) * 2
    }

    function onVisibilityChange() {
      visible = document.visibilityState === 'visible'
      if (visible && !reduceMotion) {
        lastFrame = 0
        frameId = requestAnimationFrame(render)
      }
    }

    function render(now: number) {
      if (!visible || reduceMotion) return
      frameId = requestAnimationFrame(render)
      if (now - lastFrame < FRAME_INTERVAL) return
      lastFrame = now

      const elapsed = clock.getElapsedTime()
      particles.rotation.y = elapsed * 0.018
      particles.rotation.x = Math.sin(elapsed * 0.21) * 0.018

      ringGroup.rotation.z = elapsed * 0.055
      ringGroup.rotation.x = Math.sin(elapsed * 0.33) * 0.035
      keyLight.intensity = 7.4 + Math.sin(elapsed * 1.4) * 1.1
      rimLight.position.x = 5 + Math.sin(elapsed * 0.45) * 1.4

      for (const blade of blades) {
        blade.position.x += blade.userData.speed * 0.025
        blade.position.y += Math.sin(elapsed * 1.3 + blade.userData.phase) * 0.004
        if (blade.position.x > 11) blade.position.x = -11
      }

      camera.position.x += (mouse.x * 0.38 - camera.position.x) * 0.035
      camera.position.y += (1.5 + mouse.y * -0.24 - camera.position.y) * 0.035
      camera.lookAt(0, -0.7, -1.6)
      renderer.render(scene, camera)
    }

    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange)
    if (!reduceMotion) frameId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      mount.removeChild(renderer.domElement)
      bladeGeometry.dispose()
      bladeMaterial.dispose()
      particleGeometry.dispose()
      ;(particles.material as any).dispose()
      grid.geometry.dispose()
      ;(grid.material as any).dispose()
      ringGroup.children.forEach((child: any) => {
        const mesh = child as any
        mesh.geometry.dispose()
        ;(mesh.material as any).dispose()
      })
      renderer.dispose()
    }
  }, [])

  return <div className="dojo-webgl-backdrop" ref={mountRef} aria-hidden="true" />
}
